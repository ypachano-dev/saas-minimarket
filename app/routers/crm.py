"""
Router: CRM y Fuerza de Ventas (RTC) — Faltantes, Post-venta, Visitas, Encuestas, Órdenes de Venta (Presupuestos/Pedidos), Rutas de Reparto, Actividades de Ruta y Segmentación RFM.
"""
import datetime
import logging
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, and_
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.security import get_current_user, verificar_rol
from app.db.session import SessionLocal
from app.models.cliente import Cliente
from app.models.peticion_faltante import PeticionFaltante
from app.models.lote import Lote
from app.models.producto import Producto
from app.models.seguimiento_bot import SeguimientoBot
from app.models.ticket import Ticket
from app.models.visita import VisitaCliente, EncuestaMarketing, EncuestaInventarioItem
from app.models.cartera import CuentaPorCobrar, PagoCxc
from app.models.orden_venta import OrdenVenta, OrdenVentaItem
from app.models.ruta import RutaVendedor, RutaActividad
from app.models.usuario import Usuario
from app.schemas import (
    TokenData,
    PeticionFaltanteCreate, PeticionFaltanteResponse,
    SeguimientoBotCreate, SeguimientoBotUpdate, SeguimientoBotResponse,
    VisitaClienteCreate, VisitaClienteResponse,
    EncuestaInventarioCreate, EncuestaInventarioSaveResponse,
    StockCeroItem, HistorialCompraItemResponse, HistorialCompraResponse,
    RankingProductoItem, ProyeccionReposicionItem,
    PendienteCobroItem, PagoRecienteItem, HistorialPagoResponse,
    OrdenVentaCreate, OrdenVentaResponse,
    RutaVendedorCreate, RutaVendedorResponse, RutaEstadoUpdate,
    ActividadAvanceUpdate, RutaActividadResponse, ActividadRtcItem,
    SegmentoClienteItem, InteligenciaCRMResponse
)

logger = logging.getLogger("app")
router = APIRouter()

ROLES_GESTION = ["admin", "propietario"]
ROLES_OPERACION = ["cajero", "admin", "propietario", "repartidor", "vendedor"]
ROLES_LECTURA_CARTERA = ["admin", "propietario", "vendedor"]
SEGMENTOS_CRM = ["VIP", "Activo", "En Riesgo", "Inactivo", "Nuevo"]


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _item_disponible(db: Session, empresa_id: int, item: str) -> bool:
    stock = (
        db.query(func.coalesce(func.sum(Lote.cantidad_actual), 0))
        .join(Producto, Producto.id == Lote.producto_id)
        .filter(
            Producto.empresa_id == empresa_id,
            Lote.empresa_id == empresa_id,
            Lote.status == "activo",
            Producto.nombre.ilike(f"%{item}%")
        )
        .scalar()
    )
    return Decimal(str(stock)) > 0


def _ultimas_encuestas_por_producto(db: Session, empresa_id: int, cliente_id: int) -> dict[int, EncuestaInventarioItem]:
    filas = db.query(EncuestaInventarioItem).filter(
        EncuestaInventarioItem.cliente_id == cliente_id
    ).join(Cliente, Cliente.id == EncuestaInventarioItem.cliente_id).filter(
        Cliente.empresa_id == empresa_id
    ).order_by(EncuestaInventarioItem.producto_id, EncuestaInventarioItem.created_at.desc()).all()
    ultimas: dict[int, EncuestaInventarioItem] = {}
    for fila in filas:
        if fila.producto_id not in ultimas:
            ultimas[fila.producto_id] = fila
    return ultimas


def _tickets_procesados_cliente(db: Session, empresa_id: int, cliente_id: int):
    return db.query(Ticket, Producto).join(Producto, Producto.id == Ticket.producto_id).filter(
        Ticket.empresa_id == empresa_id,
        Ticket.cliente_id == cliente_id,
        Ticket.status == "procesado"
    ).order_by(Ticket.created_at.desc()).all()


def _calcular_inteligencia_crm(db: Session, empresa_id: int) -> InteligenciaCRMResponse:
    hoy = datetime.date.today()
    hace_90 = hoy - datetime.timedelta(days=90)
    clientes = db.query(Cliente).filter(Cliente.empresa_id == empresa_id).all()
    filas_90d = (
        db.query(
            Ticket.cliente_id,
            func.count(Ticket.id).label("frecuencia"),
            func.sum(Ticket.monto_usd).label("monto"),
        )
        .filter(Ticket.empresa_id == empresa_id, Ticket.status == "procesado", func.date(Ticket.created_at) >= hace_90)
        .group_by(Ticket.cliente_id)
        .all()
    )
    stats_90d = {f.cliente_id: f for f in filas_90d}
    filas_ultima = (
        db.query(Ticket.cliente_id, func.max(Ticket.created_at).label("ultima"))
        .filter(Ticket.empresa_id == empresa_id, Ticket.status == "procesado")
        .group_by(Ticket.cliente_id)
        .all()
    )
    ultima_compra = {f.cliente_id: f.ultima for f in filas_ultima}
    filas_cxc = (
        db.query(
            CuentaPorCobrar.cliente_id,
            func.sum(CuentaPorCobrar.monto_total - CuentaPorCobrar.monto_abonado).label("saldo"),
            func.min(CuentaPorCobrar.fecha_vencimiento).label("vencimiento_mas_antiguo"),
        )
        .filter(CuentaPorCobrar.empresa_id == empresa_id, CuentaPorCobrar.status != "pagada")
        .group_by(CuentaPorCobrar.cliente_id)
        .all()
    )
    stats_cxc = {f.cliente_id: f for f in filas_cxc}
    items: List[SegmentoClienteItem] = []
    resumen = {s: 0 for s in SEGMENTOS_CRM}
    monto_riesgo = Decimal("0")
    for c in clientes:
        st90 = stats_90d.get(c.id)
        frecuencia = st90.frecuencia if st90 else 0
        monto90 = Decimal(str(st90.monto)) if st90 and st90.monto is not None else Decimal("0")
        ultima = ultima_compra.get(c.id)
        dias_ultima = (hoy - ultima.date()).days if ultima else None
        antiguedad = (hoy - c.created_at.date()).days if c.created_at else 9999
        cxc = stats_cxc.get(c.id)
        saldo_cxc = Decimal(str(cxc.saldo)) if cxc and cxc.saldo is not None else Decimal("0")
        vencida = bool(cxc and cxc.vencimiento_mas_antiguo and cxc.vencimiento_mas_antiguo < hoy and saldo_cxc > 0)
        if dias_ultima is None:
            segmento = "Nuevo" if antiguedad <= 30 else "Inactivo"
        elif dias_ultima <= 30 and frecuencia >= 3:
            segmento = "VIP"
        elif dias_ultima <= 45:
            segmento = "Activo"
        elif dias_ultima <= 90:
            segmento = "En Riesgo"
        else:
            segmento = "Inactivo"
        if vencida:
            recomendacion = f"Cobrar saldo vencido de ${saldo_cxc:.2f}"
        elif segmento == "En Riesgo":
            recomendacion = f"Reactivar: sin comprar hace {dias_ultima} días"
        elif segmento == "Inactivo":
            recomendacion = "Recuperar cliente dormido (nunca compró)" if dias_ultima is None else f"Recuperar: sin comprar hace {dias_ultima} días"
        elif segmento == "VIP":
            recomendacion = "Fidelizar: cliente frecuente, considera un beneficio especial"
        elif segmento == "Nuevo":
            recomendacion = "Dar seguimiento de bienvenida"
        else:
            recomendacion = "Mantener relación habitual"
        resumen[segmento] += 1
        if segmento == "En Riesgo":
            monto_riesgo += monto90
        if vencida:
            monto_riesgo += saldo_cxc
        items.append(SegmentoClienteItem(
            cliente_id=c.id, nombre=c.nombre, telefono=c.telefono, segmento=segmento,
            dias_ultima_compra=dias_ultima, frecuencia_90d=frecuencia, monto_90d=monto90,
            saldo_cxc=saldo_cxc, saldo_cxc_vencido=vencida, recomendacion=recomendacion,
        ))
    orden_prioridad = {"En Riesgo": 0, "Inactivo": 1, "VIP": 2, "Nuevo": 3, "Activo": 4}
    items.sort(key=lambda i: (orden_prioridad.get(i.segmento, 9), -float(i.saldo_cxc)))
    return InteligenciaCRMResponse(clientes=items, resumen_segmentos=resumen, monto_en_riesgo_usd=monto_riesgo)


# ─────────────────────────────────────────────────────────────
# Libro de Faltantes CRM
# ─────────────────────────────────────────────────────────────
@router.post("/api/v1/crm/faltantes", tags=["CRM"], response_model=PeticionFaltanteResponse)
def crear_peticion_faltante(datos: PeticionFaltanteCreate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))):
    empresa_id = usuario_actual.eid
    cliente = db.query(Cliente).filter(Cliente.id == datos.cliente_id, Cliente.empresa_id == empresa_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado.")
    peticion = PeticionFaltante(empresa_id=empresa_id, cliente_id=datos.cliente_id, item=datos.item)
    db.add(peticion)
    db.commit()
    db.refresh(peticion)
    return PeticionFaltanteResponse(
        id=peticion.id, cliente_id=peticion.cliente_id, cliente_nombre=cliente.nombre,
        item=peticion.item, status=peticion.status, disponible=_item_disponible(db, empresa_id, peticion.item),
        created_at=peticion.created_at
    )


@router.get("/api/v1/crm/faltantes", tags=["CRM"], response_model=List[PeticionFaltanteResponse])
def listar_peticiones_faltantes(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))):
    empresa_id = usuario_actual.eid
    filas = (
        db.query(PeticionFaltante, Cliente.nombre).join(Cliente, Cliente.id == PeticionFaltante.cliente_id)
        .filter(PeticionFaltante.empresa_id == empresa_id).order_by(PeticionFaltante.created_at.desc())
        .offset(skip).limit(limit).all()
    )
    return [
        PeticionFaltanteResponse(
            id=p.id, cliente_id=p.cliente_id, cliente_nombre=nombre,
            item=p.item, status=p.status, disponible=_item_disponible(db, empresa_id, p.item),
            created_at=p.created_at
        )
        for p, nombre in filas
    ]


# ─────────────────────────────────────────────────────────────
# Post-Venta CRM
# ─────────────────────────────────────────────────────────────
@router.get("/api/v1/crm/postventa-logs", tags=["CRM"], response_model=List[SeguimientoBotResponse])
def listar_postventa_logs(cliente_id: Optional[int] = None, status_envio: Optional[str] = None, skip: int = 0, limit: int = 100, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))):
    empresa_id = usuario_actual.eid
    query = (
        db.query(SeguimientoBot, Cliente.nombre).join(Ticket, Ticket.id == SeguimientoBot.ticket_id)
        .join(Cliente, Cliente.id == Ticket.cliente_id).filter(SeguimientoBot.empresa_id == empresa_id)
    )
    if cliente_id is not None:
        query = query.filter(Ticket.cliente_id == cliente_id)
    if status_envio is not None:
        query = query.filter(SeguimientoBot.status_envio == status_envio)
    filas = query.order_by(SeguimientoBot.created_at.desc()).offset(skip).limit(limit).all()
    return [
        SeguimientoBotResponse(
            id=s.id, ticket_id=s.ticket_id, cliente_nombre=nombre,
            tipo_mensaje=s.tipo_mensaje, respuesta_cliente=s.respuesta_cliente,
            status_envio=s.status_envio, created_at=s.created_at
        )
        for s, nombre in filas
    ]


@router.post("/api/v1/crm/postventa-logs", tags=["CRM"], response_model=SeguimientoBotResponse, status_code=status.HTTP_201_CREATED)
def crear_postventa_log(datos: SeguimientoBotCreate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(get_current_user)):
    ticket = db.query(Ticket).filter(Ticket.id == datos.ticket_id, Ticket.empresa_id == usuario_actual.eid).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado o no pertenece a su empresa.")
    cliente = db.query(Cliente).filter(Cliente.id == ticket.cliente_id).first()
    cliente_nombre = cliente.nombre if cliente else "Desconocido"
    nuevo_log = SeguimientoBot(
        empresa_id=usuario_actual.eid, ticket_id=datos.ticket_id, tipo_mensaje=datos.tipo_mensaje,
        respuesta_cliente=datos.respuesta_cliente, status_envio=datos.status_envio
    )
    try:
        db.add(nuevo_log)
        db.commit()
        db.refresh(nuevo_log)
    except Exception:
        logger.exception("Error al registrar la encuesta")
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al registrar la encuesta.")
    return SeguimientoBotResponse(
        id=nuevo_log.id, ticket_id=nuevo_log.ticket_id, cliente_nombre=cliente_nombre,
        tipo_mensaje=nuevo_log.tipo_mensaje, respuesta_cliente=nuevo_log.respuesta_cliente,
        status_envio=nuevo_log.status_envio, created_at=nuevo_log.created_at
    )


@router.put("/api/v1/crm/postventa-logs/{log_id}", tags=["CRM"], response_model=SeguimientoBotResponse)
def actualizar_postventa_log(log_id: int, datos: SeguimientoBotUpdate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))):
    log = db.query(SeguimientoBot).filter(SeguimientoBot.id == log_id, SeguimientoBot.empresa_id == usuario_actual.eid).first()
    if not log:
        raise HTTPException(status_code=404, detail="Registro de postventa no encontrado.")
    ticket = db.query(Ticket).filter(Ticket.id == log.ticket_id).first()
    cliente = db.query(Cliente).filter(Cliente.id == ticket.cliente_id).first() if ticket else None
    cliente_nombre = cliente.nombre if cliente else "Desconocido"
    log.status_envio = datos.status_envio
    if datos.respuesta_cliente is not None:
        log.respuesta_cliente = datos.respuesta_cliente
    try:
        db.commit()
        db.refresh(log)
    except Exception:
        logger.exception("Error al actualizar la encuesta")
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al actualizar la encuesta.")
    return SeguimientoBotResponse(
        id=log.id, ticket_id=log.ticket_id, cliente_nombre=cliente_nombre,
        tipo_mensaje=log.tipo_mensaje, respuesta_cliente=log.respuesta_cliente,
        status_envio=log.status_envio, created_at=log.created_at
    )


@router.get("/api/v1/crm/inteligencia", tags=["CRM"], response_model=InteligenciaCRMResponse)
def inteligencia_crm(db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))):
    return _calcular_inteligencia_crm(db, usuario_actual.eid)


# ─────────────────────────────────────────────────────────────
# Fuerza de Ventas (RTC) — Visitas y Encuestas
# ─────────────────────────────────────────────────────────────
@router.post("/api/v1/visitas", tags=["Fuerza de Ventas"], response_model=VisitaClienteResponse, status_code=status.HTTP_201_CREATED)
def crear_visita_cliente(datos: VisitaClienteCreate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(get_current_user)):
    cliente = db.query(Cliente).filter(Cliente.id == datos.cliente_id, Cliente.empresa_id == usuario_actual.eid).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado o no pertenece a la empresa.")
    nueva_visita = VisitaCliente(
        empresa_id=usuario_actual.eid, vendedor_id=usuario_actual.usuario_id, cliente_id=datos.cliente_id,
        comentarios=datos.comentarios, lat=datos.lat, lng=datos.lng, foto_visita_url=datos.foto_visita_url
    )
    db.add(nueva_visita)
    db.flush()
    if datos.encuesta:
        nueva_encuesta = EncuestaMarketing(
            visita_id=nueva_visita.id, inventario_cliente=datos.encuesta.inventario_cliente,
            rotacion_productos=datos.encuesta.rotacion_productos, comentarios_adicionales=datos.encuesta.comentarios_adicionales
        )
        db.add(nueva_encuesta)
    try:
        db.commit()
        db.refresh(nueva_visita)
        return nueva_visita
    except Exception:
        logger.exception("Error al registrar la visita")
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al registrar la visita.")


@router.get("/api/v1/visitas/cliente/{cliente_id}", tags=["Fuerza de Ventas"], response_model=List[VisitaClienteResponse])
def listar_visitas_cliente(cliente_id: int, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(get_current_user)):
    return db.query(VisitaCliente).filter(VisitaCliente.cliente_id == cliente_id, VisitaCliente.empresa_id == usuario_actual.eid).order_by(VisitaCliente.fecha_visita.desc()).all()


@router.get("/api/v1/visitas", tags=["Fuerza de Ventas"], response_model=List[VisitaClienteResponse])
def listar_todas_visitas(db: Session = Depends(get_db), usuario_actual: TokenData = Depends(get_current_user)):
    return db.query(VisitaCliente).filter(VisitaCliente.empresa_id == usuario_actual.eid).order_by(VisitaCliente.fecha_visita.desc()).all()


@router.post("/api/v1/visita-cliente/encuesta", tags=["Visita Cliente"], response_model=EncuestaInventarioSaveResponse, status_code=status.HTTP_201_CREATED)
def crear_encuesta_inventario(datos: EncuestaInventarioCreate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))):
    if not datos.items:
        raise HTTPException(status_code=400, detail="La encuesta debe incluir al menos un producto.")
    cliente = db.query(Cliente).filter(Cliente.id == datos.cliente_id, Cliente.empresa_id == usuario_actual.eid).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado o no pertenece a la empresa.")
    nueva_visita = VisitaCliente(empresa_id=usuario_actual.eid, vendedor_id=usuario_actual.usuario_id, cliente_id=datos.cliente_id, comentarios="Encuesta de inventario y quejas de productos", lat=datos.lat, lng=datos.lng)
    db.add(nueva_visita)
    db.flush()
    items_guardados = 0
    for item in datos.items:
        producto = db.query(Producto).filter(Producto.id == item.producto_id, Producto.empresa_id == usuario_actual.eid).first()
        if not producto:
            db.rollback()
            raise HTTPException(status_code=404, detail=f"El producto {item.producto_id} no existe o no pertenece a su empresa.")
        db.add(EncuestaInventarioItem(
            visita_id=nueva_visita.id, cliente_id=datos.cliente_id, producto_id=item.producto_id,
            stock_observado=item.stock_observado, tiene_queja=item.tiene_queja,
            detalle_queja=item.detalle_queja if item.tiene_queja else None,
        ))
        items_guardados += 1
    try:
        db.commit()
    except Exception:
        logger.exception("Error al registrar la encuesta")
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al registrar la encuesta.")
    return EncuestaInventarioSaveResponse(status="success", visita_id=nueva_visita.id, items_guardados=items_guardados)


@router.get("/api/v1/visita-cliente/clientes/{cliente_id}/stock-cero", tags=["Visita Cliente"], response_model=List[StockCeroItem])
def stock_cero_cliente(cliente_id: int, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))):
    ultimas = _ultimas_encuestas_por_producto(db, usuario_actual.eid, cliente_id)
    en_cero = [fila for fila in ultimas.values() if fila.stock_observado == 0]
    en_cero.sort(key=lambda f: f.created_at, reverse=True)
    productos = {p.id: p for p in db.query(Producto).filter(Producto.id.in_([f.producto_id for f in en_cero])).all()}
    return [
        StockCeroItem(
            producto_id=fila.producto_id,
            codigo=productos[fila.producto_id].codigo_interno if fila.producto_id in productos else "",
            nombre=productos[fila.producto_id].nombre if fila.producto_id in productos else "Producto eliminado",
            stock_observado=fila.stock_observado, creado_en=fila.created_at,
        )
        for fila in en_cero
    ]


@router.get("/api/v1/visita-cliente/clientes/{cliente_id}/historial-compra", tags=["Visita Cliente"], response_model=List[HistorialCompraResponse])
def historial_compra_cliente(cliente_id: int, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))):
    filas = _tickets_procesados_cliente(db, usuario_actual.eid, cliente_id)
    grupos: dict[datetime.datetime, list[tuple]] = {}
    for ticket, producto in filas:
        grupos.setdefault(ticket.created_at, []).append((ticket, producto))
    facturas: list[HistorialCompraResponse] = []
    for fecha, lineas in grupos.items():
        primer_ticket = lineas[0][0]
        items = [
            HistorialCompraItemResponse(
                producto_id=producto.id, codigo=producto.codigo_interno, nombre=producto.nombre,
                cantidad=ticket.peso, precio_unitario=(ticket.monto_usd / ticket.peso) if ticket.peso else Decimal("0"),
                total_linea=ticket.monto_usd,
            )
            for ticket, producto in lineas
        ]
        facturas.append(HistorialCompraResponse(
            id=primer_ticket.id, numero=f"T-{primer_ticket.id}", numero_factura_a2=None,
            fecha_emision=fecha, total_usd=sum((i.total_linea for i in items), Decimal("0")), items=items,
        ))
    facturas.sort(key=lambda f: f.fecha_emision, reverse=True)
    return facturas


@router.get("/api/v1/visita-cliente/clientes/{cliente_id}/ranking-productos", tags=["Visita Cliente"], response_model=List[RankingProductoItem])
def ranking_productos_cliente(cliente_id: int, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))):
    filas = _tickets_procesados_cliente(db, usuario_actual.eid, cliente_id)
    agregado: dict[int, dict] = {}
    for ticket, producto in filas:
        acc = agregado.setdefault(producto.id, {"producto": producto, "total_cantidad": Decimal("0"), "total_monto": Decimal("0"), "fechas": set()})
        acc["total_cantidad"] += ticket.peso
        acc["total_monto"] += ticket.monto_usd
        acc["fechas"].add(ticket.created_at)
    ranking = [
        RankingProductoItem(
            producto_id=acc["producto"].id, codigo=acc["producto"].codigo_interno, nombre=acc["producto"].nombre,
            total_cantidad=acc["total_cantidad"], total_monto=acc["total_monto"], num_facturas=len(acc["fechas"]),
        )
        for acc in agregado.values()
    ]
    ranking.sort(key=lambda r: r.total_cantidad, reverse=True)
    return ranking


@router.get("/api/v1/visita-cliente/clientes/{cliente_id}/proyeccion-reposicion", tags=["Visita Cliente"], response_model=List[ProyeccionReposicionItem])
def proyeccion_reposicion_cliente(cliente_id: int, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))):
    filas = _tickets_procesados_cliente(db, usuario_actual.eid, cliente_id)
    ultimas_encuestas = _ultimas_encuestas_por_producto(db, usuario_actual.eid, cliente_id)
    hoy = datetime.datetime.now()
    por_producto: dict[int, dict] = {}
    for ticket, producto in filas:
        acc = por_producto.setdefault(producto.id, {"producto": producto, "fechas": [], "cantidades": []})
        acc["fechas"].append(ticket.created_at)
        acc["cantidades"].append(ticket.peso)
    resultado: list[ProyeccionReposicionItem] = []
    for acc in por_producto.values():
        producto = acc["producto"]
        fechas = sorted(acc["fechas"])
        cantidades = acc["cantidades"]
        num_compras = len(fechas)
        cantidad_promedio = (sum(cantidades, Decimal("0")) / num_compras) if num_compras else Decimal("0")
        intervalo_promedio_dias = None
        proxima_compra_esperada = None
        if num_compras >= 2:
            intervalos = [(fechas[i] - fechas[i - 1]).total_seconds() / 86400 for i in range(1, num_compras)]
            intervalo_promedio_dias = sum(intervalos) / len(intervalos)
            proxima_compra_esperada = (fechas[-1] + datetime.timedelta(days=intervalo_promedio_dias)).date()
        encuesta = ultimas_encuestas.get(producto.id)
        stock_observado_actual = encuesta.stock_observado if encuesta else None
        dias_para_proxima = (proxima_compra_esperada - hoy.date()).days if proxima_compra_esperada else None
        recomendado_reponer_ahora = (
            (stock_observado_actual is not None and stock_observado_actual <= 0)
            or (dias_para_proxima is not None and dias_para_proxima <= 3)
        )
        resultado.append(ProyeccionReposicionItem(
            producto_id=producto.id, codigo=producto.codigo_interno, nombre=producto.nombre,
            num_compras=num_compras, cantidad_promedio=cantidad_promedio,
            intervalo_promedio_dias=intervalo_promedio_dias, ultima_compra=fechas[-1],
            proxima_compra_esperada=proxima_compra_esperada, stock_observado_actual=stock_observado_actual,
            recomendado_reponer_ahora=recomendado_reponer_ahora,
        ))
    resultado.sort(key=lambda r: (not r.recomendado_reponer_ahora, r.proxima_compra_esperada or datetime.date.max))
    return resultado


@router.get("/api/v1/visita-cliente/clientes/{cliente_id}/historial-pago", tags=["Visita Cliente"], response_model=HistorialPagoResponse)
def historial_pago_cliente(cliente_id: int, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_LECTURA_CARTERA))):
    hoy = datetime.date.today()
    cxc_pendientes = db.query(CuentaPorCobrar).filter(
        CuentaPorCobrar.empresa_id == usuario_actual.eid, CuentaPorCobrar.cliente_id == cliente_id, CuentaPorCobrar.status != "pagada"
    ).order_by(CuentaPorCobrar.fecha_vencimiento.asc()).all()
    pendientes = [
        PendienteCobroItem(id=c.id, numero_doc=f"CXC-{c.id}", fecha_vencimiento=c.fecha_vencimiento, saldo_usd=c.monto_total - c.monto_abonado, vencida=c.fecha_vencimiento < hoy)
        for c in cxc_pendientes
    ]
    pagos = db.query(PagoCxc).filter(PagoCxc.empresa_id == usuario_actual.eid, PagoCxc.cliente_id == cliente_id).order_by(PagoCxc.created_at.desc()).limit(20).all()
    pagos_recientes = [
        PagoRecienteItem(fecha=p.created_at, monto=p.monto, metodo=p.metodo, estado=p.estado)
        for p in pagos
    ]
    return HistorialPagoResponse(cliente_id=cliente_id, pendientes=pendientes, pagos_recientes=pagos_recientes, requiere_cuestionario_cobranza=any(p.vencida for p in pendientes))


# ─────────────────────────────────────────────────────────────
# Cotizaciones y Presupuestos / Pedidos (Fuerza de Ventas)
# ─────────────────────────────────────────────────────────────
@router.post("/api/v1/ventas/ordenes", tags=["Fuerza de Ventas"], response_model=OrdenVentaResponse, status_code=status.HTTP_201_CREATED)
def crear_orden_venta(datos: OrdenVentaCreate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(get_current_user)):
    cliente = db.query(Cliente).filter(Cliente.id == datos.cliente_id, Cliente.empresa_id == usuario_actual.eid).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado o no pertenece a la empresa.")
    nueva_orden = OrdenVenta(empresa_id=usuario_actual.eid, vendedor_id=usuario_actual.usuario_id, cliente_id=datos.cliente_id, tipo=datos.tipo, total_usd=Decimal("0.00"), notas=datos.notas, estatus="pendiente")
    db.add(nueva_orden)
    db.flush()
    total = Decimal("0.00")
    for item in datos.items:
        producto = db.query(Producto).filter(Producto.id == item.producto_id, Producto.empresa_id == usuario_actual.eid).first()
        if not producto:
            raise HTTPException(status_code=404, detail=f"Producto id {item.producto_id} no encontrado.")
        monto_item = item.cantidad * item.precio_unitario
        total += monto_item
        nuevo_item = OrdenVentaItem(orden_venta_id=nueva_orden.id, producto_id=item.producto_id, cantidad=item.cantidad, precio_unitario=item.precio_unitario, monto_usd=monto_item)
        db.add(nuevo_item)
        if datos.tipo == "pedido":
            stock_disp = db.query(func.sum(Lote.cantidad_actual)).filter(Lote.producto_id == item.producto_id, Lote.empresa_id == usuario_actual.eid, Lote.status == "activo").scalar() or Decimal("0.00")
            if stock_disp <= 0:
                faltante_prev = db.query(PeticionFaltante).filter(PeticionFaltante.cliente_id == datos.cliente_id, PeticionFaltante.item.like(f"%{producto.nombre}%")).first()
                if not faltante_prev:
                    db.add(PeticionFaltante(cliente_id=datos.cliente_id, item=f"{producto.nombre} (Solicitado por Vendedor)", status="pendiente", disponible=False))
    nueva_orden.total_usd = total
    try:
        db.commit()
        db.refresh(nueva_orden)
        res = OrdenVentaResponse.model_validate(nueva_orden)
        res.cliente_nombre = cliente.nombre
        for idx, it in enumerate(nueva_orden.items):
            prod = db.query(Producto).filter(Producto.id == it.producto_id).first()
            res.items[idx].producto_nombre = prod.nombre if prod else "Desconocido"
        return res
    except Exception:
        logger.exception("Error al registrar orden de venta")
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al registrar orden de venta.")


@router.get("/api/v1/ventas/ordenes/cliente/{cliente_id}", tags=["Fuerza de Ventas"], response_model=List[OrdenVentaResponse])
def listar_ordenes_cliente(cliente_id: int, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(get_current_user)):
    ordenes = db.query(OrdenVenta).filter(OrdenVenta.cliente_id == cliente_id, OrdenVenta.empresa_id == usuario_actual.eid).order_by(OrdenVenta.created_at.desc()).all()
    resultado = []
    for o in ordenes:
        res = OrdenVentaResponse.model_validate(o)
        cli = db.query(Cliente).filter(Cliente.id == o.cliente_id).first()
        res.cliente_nombre = cli.nombre if cli else "Desconocido"
        for idx, it in enumerate(o.items):
            prod = db.query(Producto).filter(Producto.id == it.producto_id).first()
            res.items[idx].producto_nombre = prod.nombre if prod else "Desconocido"
        resultado.append(res)
    return resultado


@router.get("/api/v1/ventas/ordenes", tags=["Fuerza de Ventas"], response_model=List[OrdenVentaResponse])
def listar_todas_ordenes(db: Session = Depends(get_db), usuario_actual: TokenData = Depends(get_current_user)):
    ordenes = db.query(OrdenVenta).filter(OrdenVenta.empresa_id == usuario_actual.eid).order_by(OrdenVenta.created_at.desc()).all()
    resultado = []
    for o in ordenes:
        res = OrdenVentaResponse.model_validate(o)
        cli = db.query(Cliente).filter(Cliente.id == o.cliente_id).first()
        res.cliente_nombre = cli.nombre if cli else "Desconocido"
        for idx, it in enumerate(o.items):
            prod = db.query(Producto).filter(Producto.id == it.producto_id).first()
            res.items[idx].producto_nombre = prod.nombre if prod else "Desconocido"
        resultado.append(res)
    return resultado


@router.put("/api/v1/ventas/ordenes/{orden_id}/estado", tags=["Fuerza de Ventas"], response_model=OrdenVentaResponse)
def actualizar_estado_orden_venta(orden_id: int, estatus: str, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))):
    orden = db.query(OrdenVenta).filter(OrdenVenta.id == orden_id, OrdenVenta.empresa_id == usuario_actual.eid).first()
    if not orden:
        raise HTTPException(status_code=404, detail="Orden de venta no encontrada.")
    orden.estatus = estatus
    try:
        db.commit()
        db.refresh(orden)
        res = OrdenVentaResponse.model_validate(orden)
        cli = db.query(Cliente).filter(Cliente.id == orden.cliente_id).first()
        res.cliente_nombre = cli.nombre if cli else "Desconocido"
        for idx, it in enumerate(orden.items):
            prod = db.query(Producto).filter(Producto.id == it.producto_id).first()
            res.items[idx].producto_nombre = prod.nombre if prod else "Desconocido"
        return res
    except Exception:
        logger.exception("Error al actualizar orden")
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al actualizar orden.")


# ─────────────────────────────────────────────────────────────
# Plan de Rutas y Viáticos RTC
# ─────────────────────────────────────────────────────────────
@router.post("/api/v1/rutas", tags=["Fuerza de Ventas"], response_model=RutaVendedorResponse, status_code=status.HTTP_201_CREATED)
def crear_ruta_vendedor(datos: RutaVendedorCreate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(get_current_user)):
    nueva_ruta = RutaVendedor(
        empresa_id=usuario_actual.eid, vendedor_id=usuario_actual.usuario_id, nombre_ruta=datos.nombre_ruta,
        fecha_inicio=datos.fecha_inicio, fecha_fin=datos.fecha_fin, estatus="pendiente_aprobacion",
        monto_viaticos_solicitado=datos.monto_viaticos_solicitado, monto_viaticos_aprobado=Decimal("0.00"), detalles_viaticos=datos.detalles_viaticos
    )
    db.add(nueva_ruta)
    db.flush()
    for act in datos.actividades:
        nueva_act = RutaActividad(ruta_id=nueva_ruta.id, cliente_id=act.cliente_id, fecha_planificada=act.fecha_planificada, actividad_planificada=act.actividad_planificada, ejecutada=False)
        db.add(nueva_act)
    try:
        db.commit()
        db.refresh(nueva_ruta)
        res = RutaVendedorResponse.model_validate(nueva_ruta)
        vendedor = db.query(Usuario).filter(Usuario.id == nueva_ruta.vendedor_id).first()
        res.vendedor_nombre = vendedor.nombre if vendedor else "Desconocido"
        for idx, act_obj in enumerate(nueva_ruta.actividades):
            if act_obj.cliente_id:
                cli = db.query(Cliente).filter(Cliente.id == act_obj.cliente_id).first()
                res.actividades[idx].cliente_nombre = cli.nombre if cli else None
        return res
    except Exception:
        logger.exception("Error al registrar ruta")
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al registrar ruta.")


@router.get("/api/v1/rutas", tags=["Fuerza de Ventas"], response_model=List[RutaVendedorResponse])
def listar_rutas(vendedor_id: Optional[int] = None, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(get_current_user)):
    query = db.query(RutaVendedor).filter(RutaVendedor.empresa_id == usuario_actual.eid)
    if usuario_actual.rol == "vendedor":
        query = query.filter(RutaVendedor.vendedor_id == usuario_actual.usuario_id)
    elif vendedor_id:
        query = query.filter(RutaVendedor.vendedor_id == vendedor_id)
    rutas = query.order_by(RutaVendedor.fecha_inicio.desc()).all()
    resultado = []
    for r in rutas:
        res = RutaVendedorResponse.model_validate(r)
        vend = db.query(Usuario).filter(Usuario.id == r.vendedor_id).first()
        res.vendedor_nombre = vend.nombre if vend else "Desconocido"
        for idx, act_obj in enumerate(r.actividades):
            if act_obj.cliente_id:
                cli = db.query(Cliente).filter(Cliente.id == act_obj.cliente_id).first()
                res.actividades[idx].cliente_nombre = cli.nombre if cli else None
        resultado.append(res)
    return resultado


@router.put("/api/v1/rutas/{ruta_id}/estado", tags=["Fuerza de Ventas"], response_model=RutaVendedorResponse)
def actualizar_estado_ruta(ruta_id: int, datos: RutaEstadoUpdate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))):
    ruta = db.query(RutaVendedor).filter(RutaVendedor.id == ruta_id, RutaVendedor.empresa_id == usuario_actual.eid).first()
    if not ruta:
        raise HTTPException(status_code=404, detail="Ruta no encontrada.")
    ruta.estatus = datos.estatus
    if datos.monto_viaticos_aprobado is not None:
        ruta.monto_viaticos_aprobado = datos.monto_viaticos_aprobado
    if datos.comentarios_gerente is not None:
        ruta.comentarios_gerente = datos.comentarios_gerente
    try:
        db.commit()
        db.refresh(ruta)
        res = RutaVendedorResponse.model_validate(ruta)
        vend = db.query(Usuario).filter(Usuario.id == ruta.vendedor_id).first()
        res.vendedor_nombre = vend.nombre if vend else "Desconocido"
        for idx, act_obj in enumerate(ruta.actividades):
            if act_obj.cliente_id:
                cli = db.query(Cliente).filter(Cliente.id == act_obj.cliente_id).first()
                res.actividades[idx].cliente_nombre = cli.nombre if cli else None
        return res
    except Exception:
        logger.exception("Error al actualizar estado de ruta")
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al actualizar estado de ruta.")


@router.post("/api/v1/rutas/actividades/{actividad_id}/avance", tags=["Fuerza de Ventas"], response_model=RutaActividadResponse)
def actualizar_avance_actividad(actividad_id: int, datos: ActividadAvanceUpdate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(get_current_user)):
    actividad = db.query(RutaActividad).join(RutaVendedor).filter(RutaActividad.id == actividad_id, RutaVendedor.empresa_id == usuario_actual.eid).first()
    if not actividad:
        raise HTTPException(status_code=404, detail="Actividad no encontrada.")
    if usuario_actual.rol == "vendedor" and actividad.ruta.vendedor_id != usuario_actual.usuario_id:
        raise HTTPException(status_code=403, detail="No tienes permisos para modificar esta actividad.")
    actividad.ejecutada = datos.ejecutada
    if datos.comentarios_avance is not None:
        actividad.comentarios_avance = datos.comentarios_avance
    if datos.foto_soporte_url is not None:
        actividad.foto_soporte_url = datos.foto_soporte_url
    if datos.factura_soporte_monto is not None:
        actividad.factura_soporte_monto = datos.factura_soporte_monto
    actividad.actualizado_en = datetime.datetime.now()
    try:
        db.commit()
        db.refresh(actividad)
        res = RutaActividadResponse.model_validate(actividad)
        if actividad.cliente_id:
            cli = db.query(Cliente).filter(Cliente.id == actividad.cliente_id).first()
            res.cliente_nombre = cli.nombre if cli else None
        return res
    except Exception:
        logger.exception("Error al reportar avance")
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al reportar avance.")


@router.get("/api/v1/dashboard/actividad-rtc", tags=["Fuerza de Ventas"], response_model=List[ActividadRtcItem])
def listar_actividad_rtc(horas: int = 24, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(get_current_user)):
    desde = datetime.datetime.now() - datetime.timedelta(hours=horas)
    eid = usuario_actual.eid
    nombres_vendedores = {u.id: u.nombre for u in db.query(Usuario).filter(Usuario.empresa_id == eid).all()}
    nombres_clientes = {c.id: c.nombre for c in db.query(Cliente).filter(Cliente.empresa_id == eid).all()}
    items: list[ActividadRtcItem] = []
    visitas_q = db.query(VisitaCliente).filter(VisitaCliente.empresa_id == eid, VisitaCliente.fecha_visita >= desde)
    if usuario_actual.rol == "vendedor":
        visitas_q = visitas_q.filter(VisitaCliente.vendedor_id == usuario_actual.usuario_id)
    for v in visitas_q.all():
        items.append(ActividadRtcItem(
            tipo="visita", fecha=v.fecha_visita,
            vendedor_id=v.vendedor_id, vendedor_nombre=nombres_vendedores.get(v.vendedor_id, "Desconocido"),
            cliente_id=v.cliente_id, cliente_nombre=nombres_clientes.get(v.cliente_id),
            descripcion="Visita registrada" + (" con encuesta de marketing" if v.encuesta else ""),
        ))
    ordenes_q = db.query(OrdenVenta).filter(OrdenVenta.empresa_id == eid, OrdenVenta.created_at >= desde)
    if usuario_actual.rol == "vendedor":
        ordenes_q = ordenes_q.filter(OrdenVenta.vendedor_id == usuario_actual.usuario_id)
    for o in ordenes_q.all():
        etiqueta = "Presupuesto" if o.tipo == "presupuesto" else "Pedido"
        items.append(ActividadRtcItem(
            tipo="orden", fecha=o.created_at,
            vendedor_id=o.vendedor_id, vendedor_nombre=nombres_vendedores.get(o.vendedor_id, "Desconocido"),
            cliente_id=o.cliente_id, cliente_nombre=nombres_clientes.get(o.cliente_id),
            descripcion=f"{etiqueta} por ${o.total_usd}", monto_usd=o.total_usd,
        ))
    avances_q = (
        db.query(RutaActividad, RutaVendedor.vendedor_id).join(RutaVendedor, RutaActividad.ruta_id == RutaVendedor.id)
        .filter(RutaVendedor.empresa_id == eid, RutaActividad.actualizado_en >= desde)
    )
    if usuario_actual.rol == "vendedor":
        avances_q = avances_q.filter(RutaVendedor.vendedor_id == usuario_actual.usuario_id)
    for act, vend_id in avances_q.all():
        items.append(ActividadRtcItem(
            tipo="avance_ruta", fecha=act.actualizado_en,
            vendedor_id=vend_id, vendedor_nombre=nombres_vendedores.get(vend_id, "Desconocido"),
            cliente_id=act.cliente_id, cliente_nombre=nombres_clientes.get(act.cliente_id) if act.cliente_id else None,
            descripcion=("Avance reportado: " + act.actividad_planificada) if act.ejecutada else ("Actividad marcada pendiente: " + act.actividad_planificada),
        ))
    items.sort(key=lambda i: i.fecha, reverse=True)
    return items[:100]
