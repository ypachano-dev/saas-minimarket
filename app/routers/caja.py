"""
Router: Caja — Tickets de venta, balanza, turnos de caja, tasa de cambio, delivery, órdenes de compra.
"""
import datetime
import logging
import urllib.request
import json
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.security import (
    get_current_user, verificar_rol,
    verificar_password,
    crear_token_autorizacion_precio, verificar_token_autorizacion_precio,
)
from app.db.session import SessionLocal
from app.models.ticket import Ticket
from app.models.cliente import Cliente
from app.models.producto import Producto
from app.models.lote import Lote
from app.models.tasa import TasaCambio
from app.models.turno_caja import TurnoCaja, EstadoTurno
from app.models.pedido_delivery import PedidoDelivery
from app.models.orden_compra import OrdenCompra, OrdenCompraItem
from app.models.usuario import Usuario
from app.schemas import (
    TokenData,
    TicketCreate, TicketPesajeCreate, TicketPesoUpdate, TicketResponse, VentaResponse,
    ProcesarPagoTickets,
    TasaCambioUpdate, TasaCambioResponse,
    AbrirTurnoRequest, CerrarTurnoRequest, TurnoCajaResponse, EstadoTurnoResponse,
    AutorizarSupervisorRequest, AutorizarSupervisorResponse,
    DesgloseMetodoPagoItem,
    PedidoDeliveryCreate, PedidoDeliveryEstadoUpdate, PedidoDeliveryResponse,
    OrdenCompraCreate, OrdenCompraResponse,
)

logger = logging.getLogger("app")
router = APIRouter()

ROLES_GESTION = ["admin", "propietario"]
ROLES_OPERACION = ["cajero", "admin", "propietario", "repartidor", "vendedor"]
ROLES_TURNO_CAJA = ["cajero", "admin", "propietario"]
ROLES_AUTORIZA_PRECIO = ["admin", "propietario"]
METODOS_PAGO_CAJA = ["Efectivo $", "Efectivo Bs", "Zelle", "Pago Móvil", "Punto de Venta", "Transferencia"]
METODO_PAGO_VES = "Efectivo Bs"
ESTADOS_PEDIDO_VALIDOS = {"CREADO", "ARMADO", "FACTURADO", "EN_VIA", "DESPACHADO", "PAGADO", "CREDITO"}


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _requiere_turno_abierto(db: Session, usuario_actual: TokenData) -> TurnoCaja:
    turno = db.query(TurnoCaja).filter(
        TurnoCaja.empresa_id == usuario_actual.eid,
        TurnoCaja.usuario_id == usuario_actual.usuario_id,
        TurnoCaja.estado == EstadoTurno.ABIERTO,
    ).first()
    if not turno:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debes abrir un turno de caja (fondo inicial) antes de procesar ventas.",
        )
    return turno


def _calcular_esperado_y_desglose(db, empresa_id, turno):
    tasa = db.query(TasaCambio).filter(TasaCambio.empresa_id == empresa_id).first()
    tasa_bcv = tasa.valor_bcv if tasa else Decimal("0")
    tickets = db.query(Ticket).filter(Ticket.turno_id == turno.id, Ticket.status == "procesado").all()
    por_metodo: dict[str, Decimal] = {m: Decimal("0.00") for m in METODOS_PAGO_CAJA}
    for t in tickets:
        metodo = t.metodo_pago if t.metodo_pago in por_metodo else METODOS_PAGO_CAJA[0]
        por_metodo[metodo] += t.monto_usd
    ventas_usd = sum((monto for metodo, monto in por_metodo.items() if metodo != METODO_PAGO_VES), Decimal("0.00"))
    ventas_ves = (por_metodo[METODO_PAGO_VES] * tasa_bcv).quantize(Decimal("0.01"))
    esperado_usd = (turno.monto_inicial_usd + ventas_usd).quantize(Decimal("0.01"))
    esperado_ves = (turno.monto_inicial_ves + ventas_ves).quantize(Decimal("0.01"))
    desglose = [
        DesgloseMetodoPagoItem(
            metodo_pago=metodo,
            monto_usd=monto if metodo != METODO_PAGO_VES else Decimal("0.00"),
            monto_ves=(monto * tasa_bcv).quantize(Decimal("0.01")) if metodo == METODO_PAGO_VES else Decimal("0.00"),
        )
        for metodo, monto in por_metodo.items()
    ]
    return esperado_usd, esperado_ves, desglose


def _construir_turno_response(db, turno) -> TurnoCajaResponse:
    esperado_usd, esperado_ves, desglose = _calcular_esperado_y_desglose(db, turno.empresa_id, turno)
    cajero = db.query(Usuario).filter(Usuario.id == turno.usuario_id).first()
    descuadre_usd = (turno.monto_real_usd - esperado_usd) if turno.monto_real_usd is not None else None
    descuadre_ves = (turno.monto_real_ves - esperado_ves) if turno.monto_real_ves is not None else None
    return TurnoCajaResponse(
        id=turno.id, usuario_id=turno.usuario_id, cajero_nombre=cajero.nombre if cajero else None,
        estado=turno.estado, fecha_apertura=turno.fecha_apertura, fecha_cierre=turno.fecha_cierre,
        monto_inicial_usd=turno.monto_inicial_usd, monto_inicial_ves=turno.monto_inicial_ves,
        monto_esperado_usd=esperado_usd, monto_esperado_ves=esperado_ves,
        monto_real_usd=turno.monto_real_usd, monto_real_ves=turno.monto_real_ves,
        descuadre_usd=descuadre_usd, descuadre_ves=descuadre_ves, desglose_metodos=desglose,
    )


def lat_lng_to_svg(lat: float, lng: float) -> tuple[float, float]:
    min_lat, max_lat = 8.5900, 8.6600
    min_lng, max_lng = -70.2400, -70.1800
    y = 340.0 - ((lat - min_lat) / (max_lat - min_lat)) * 320.0
    x = 20.0 + ((lng - min_lng) / (max_lng - min_lng)) * 460.0
    return round(x, 1), round(y, 1)


# ─────────────────────────────────────────────────────────────
# Tasa de Cambio BCV
# ─────────────────────────────────────────────────────────────
@router.put("/api/v1/tasa", tags=["Tasa de Cambio"], response_model=TasaCambioResponse)
def actualizar_tasa(datos: TasaCambioUpdate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))):
    if datos.valor_bcv <= 0:
        raise HTTPException(status_code=400, detail="El valor de la tasa BCV debe ser mayor a cero.")
    if datos.valor_eur is not None and datos.valor_eur <= 0:
        raise HTTPException(status_code=400, detail="El valor de la tasa Euro debe ser mayor a cero.")
    tasa = db.query(TasaCambio).filter(TasaCambio.empresa_id == usuario_actual.eid).first()
    ahora = datetime.datetime.now(datetime.timezone.utc)
    if tasa:
        tasa.valor_bcv = datos.valor_bcv
        if datos.valor_eur is not None:
            tasa.valor_eur = datos.valor_eur
        tasa.fecha_actualizacion = ahora
    else:
        tasa = TasaCambio(empresa_id=usuario_actual.eid, valor_bcv=datos.valor_bcv, valor_eur=datos.valor_eur, fecha_actualizacion=ahora)
        db.add(tasa)
    try:
        db.commit()
        db.refresh(tasa)
    except Exception:
        logger.exception("Error al actualizar la tasa de cambio")
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al actualizar la tasa de cambio.")
    return tasa


@router.get("/api/v1/tasa", tags=["Tasa de Cambio"], response_model=TasaCambioResponse)
def obtener_tasa(db: Session = Depends(get_db), usuario_actual: TokenData = Depends(get_current_user)):
    tasa = db.query(TasaCambio).filter(TasaCambio.empresa_id == usuario_actual.eid).first()
    ahora = datetime.datetime.now(datetime.timezone.utc)
    actualizar = not tasa or tasa.valor_eur is None
    if not actualizar and tasa.fecha_actualizacion:
        fecha_act = tasa.fecha_actualizacion
        if fecha_act.tzinfo is None:
            fecha_act = fecha_act.replace(tzinfo=datetime.timezone.utc)
        if (ahora - fecha_act).total_seconds() > 4 * 3600:
            actualizar = True
    if actualizar:
        valor_usd = Decimal("652.97")
        valor_eur = Decimal("747.33")
        try:
            req = urllib.request.Request('https://ve.dolarapi.com/v1/dolares/oficial', headers={'User-Agent': 'Mozilla/5.0'})
            res_data = json.loads(urllib.request.urlopen(req, timeout=3).read().decode('utf-8'))
            promedio = res_data.get("promedio")
            if promedio:
                valor_usd = Decimal(str(round(promedio, 2)))
        except Exception:
            if tasa:
                valor_usd = tasa.valor_bcv
        try:
            req_eur = urllib.request.Request('https://ve.dolarapi.com/v1/euros/oficial', headers={'User-Agent': 'Mozilla/5.0'})
            res_eur = json.loads(urllib.request.urlopen(req_eur, timeout=3).read().decode('utf-8'))
            promedio_eur = res_eur.get("promedio")
            if promedio_eur:
                valor_eur = Decimal(str(round(promedio_eur, 2)))
        except Exception:
            if tasa and tasa.valor_eur is not None:
                valor_eur = tasa.valor_eur
        if not tasa:
            tasa = TasaCambio(empresa_id=usuario_actual.eid, valor_bcv=valor_usd, valor_eur=valor_eur)
            db.add(tasa)
        else:
            tasa.valor_bcv = valor_usd
            tasa.valor_eur = valor_eur
            tasa.fecha_actualizacion = ahora
        try:
            db.commit()
            db.refresh(tasa)
        except Exception:
            db.rollback()
    return tasa


# ─────────────────────────────────────────────────────────────
# Tickets / Ventas
# ─────────────────────────────────────────────────────────────
@router.post("/api/v1/tickets", tags=["Ventas"], response_model=VentaResponse, status_code=status.HTTP_201_CREATED)
def crear_ticket(datos: TicketCreate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))):
    if not datos.items:
        raise HTTPException(status_code=400, detail="La venta debe incluir al menos un producto.")
    turno_activo = _requiere_turno_abierto(db, usuario_actual)
    cliente = db.query(Cliente).filter(Cliente.id == datos.cliente_id, Cliente.empresa_id == usuario_actual.eid).first()
    if not cliente:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="El cliente indicado no existe o no pertenece a su empresa.")
    tasa = db.query(TasaCambio).filter(TasaCambio.empresa_id == usuario_actual.eid).first()
    if not tasa:
        raise HTTPException(status_code=400, detail="Debe configurar la tasa de cambio BCV de su empresa (PUT /api/v1/tasa) antes de registrar ventas.")
    tasa_bcv = tasa.valor_bcv
    tickets_creados: list[tuple[Ticket, Decimal]] = []
    total_usd = Decimal("0.00")
    total_ves = Decimal("0.00")
    try:
        for item in datos.items:
            if item.peso <= 0:
                raise HTTPException(status_code=400, detail="La cantidad/peso de cada producto debe ser mayor a cero.")
            producto = db.query(Producto).filter(Producto.id == item.producto_id, Producto.empresa_id == usuario_actual.eid).first()
            if not producto:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"El producto {item.producto_id} no existe o no pertenece a su empresa.")
            precio_efectivo = producto.precio_1_detalle
            if item.precio_unitario is not None and item.precio_unitario != producto.precio_1_detalle:
                if usuario_actual.rol == "cajero":
                    if not datos.autorizacion_supervisor or not verificar_token_autorizacion_precio(datos.autorizacion_supervisor, usuario_actual.eid):
                        raise HTTPException(status_code=400, detail=f"El precio de '{producto.nombre}' difiere del catálogo y requiere autorización de Gerencia.")
                precio_efectivo = item.precio_unitario
            lotes = db.query(Lote).filter(
                Lote.empresa_id == usuario_actual.eid, Lote.producto_id == item.producto_id,
                Lote.status == "activo", Lote.cantidad_actual > 0
            ).order_by(Lote.fecha_vencimiento.asc(), Lote.fecha_ingreso.asc()).all()
            stock_disponible = sum((lote.cantidad_actual for lote in lotes), Decimal("0"))
            if stock_disponible < item.peso:
                raise HTTPException(status_code=400, detail=f"Stock insuficiente para '{producto.nombre}'. Disponible: {stock_disponible}, solicitado: {item.peso}")
            restante = item.peso
            for lote in lotes:
                if restante <= 0:
                    break
                descuento = min(lote.cantidad_actual, restante)
                lote.cantidad_actual -= descuento
                restante -= descuento
                if lote.cantidad_actual == 0:
                    lote.status = "agotado"
            monto_usd = (item.peso * precio_efectivo).quantize(Decimal("0.01"))
            monto_ves = (monto_usd * tasa_bcv).quantize(Decimal("0.01"))
            nuevo_ticket = Ticket(
                empresa_id=usuario_actual.eid, usuario_id=usuario_actual.usuario_id,
                producto_id=item.producto_id, cliente_id=datos.cliente_id,
                peso=item.peso, monto_usd=monto_usd, status="procesado",
                turno_id=turno_activo.id, metodo_pago=datos.metodo_pago,
            )
            db.add(nuevo_ticket)
            tickets_creados.append((nuevo_ticket, monto_ves))
            total_usd += monto_usd
            total_ves += monto_ves
        db.commit()
        for ticket, _ in tickets_creados:
            db.refresh(ticket)
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        logger.exception("Error al registrar la venta")
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al registrar la venta.")
    tickets_respuesta = [
        TicketResponse(
            id=ticket.id, empresa_id=ticket.empresa_id, usuario_id=ticket.usuario_id,
            producto_id=ticket.producto_id, cliente_id=ticket.cliente_id,
            peso=ticket.peso, monto_usd=ticket.monto_usd, monto_ves=monto_ves,
            status=ticket.status, created_at=ticket.created_at,
            direccion_entrega=ticket.direccion_entrega, repartidor_id=ticket.repartidor_id,
            x=ticket.coord_x, y=ticket.coord_y,
            cliente=cliente.nombre if cliente else "Desconocido", direccion=ticket.direccion_entrega
        )
        for ticket, monto_ves in tickets_creados
    ]
    return VentaResponse(tickets=tickets_respuesta, total_usd=total_usd, total_ves=total_ves, tasa_bcv=tasa_bcv)


@router.get("/api/v1/tickets", tags=["Ventas"], response_model=List[TicketResponse])
def listar_tickets(status: Optional[str] = None, cliente_id: Optional[int] = None, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))):
    query = db.query(Ticket).filter(Ticket.empresa_id == usuario_actual.eid)
    if status:
        query = query.filter(Ticket.status == status)
    if cliente_id:
        query = query.filter(Ticket.cliente_id == cliente_id)
    tasa = db.query(TasaCambio).filter(TasaCambio.empresa_id == usuario_actual.eid).first()
    tasa_bcv = tasa.valor_bcv if tasa else Decimal("0")
    tickets = query.all()
    resultado = []
    for ticket in tickets:
        cliente_db = db.query(Cliente).filter(Cliente.id == ticket.cliente_id).first()
        resultado.append(TicketResponse(
            id=ticket.id, empresa_id=ticket.empresa_id, usuario_id=ticket.usuario_id,
            producto_id=ticket.producto_id, cliente_id=ticket.cliente_id,
            peso=ticket.peso, monto_usd=ticket.monto_usd,
            monto_ves=(ticket.monto_usd * tasa_bcv).quantize(Decimal("0.01")),
            status=ticket.status, created_at=ticket.created_at,
            direccion_entrega=ticket.direccion_entrega, repartidor_id=ticket.repartidor_id,
            x=ticket.coord_x, y=ticket.coord_y,
            cliente=cliente_db.nombre if cliente_db else "Desconocido", direccion=ticket.direccion_entrega
        ))
    return resultado


# ─────────────────────────────────────────────────────────────
# Balanza / Pesaje
# ─────────────────────────────────────────────────────────────
@router.post("/api/v1/tickets/pesaje", tags=["Ventas"], response_model=TicketResponse, status_code=status.HTTP_201_CREATED)
def crear_ticket_pesaje(datos: TicketPesajeCreate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(get_current_user)):
    cliente = db.query(Cliente).filter(Cliente.id == datos.cliente_id, Cliente.empresa_id == usuario_actual.eid).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado.")
    producto = db.query(Producto).filter(Producto.id == datos.producto_id, Producto.empresa_id == usuario_actual.eid).first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado.")
    monto_usd = (datos.peso * producto.precio_1_detalle).quantize(Decimal("0.01"))
    tasa = db.query(TasaCambio).filter(TasaCambio.empresa_id == usuario_actual.eid).first()
    tasa_bcv = tasa.valor_bcv if tasa else Decimal("0")
    monto_ves = (monto_usd * tasa_bcv).quantize(Decimal("0.01"))
    nuevo_ticket = Ticket(
        empresa_id=usuario_actual.eid, usuario_id=usuario_actual.usuario_id,
        producto_id=datos.producto_id, cliente_id=datos.cliente_id,
        peso=datos.peso, monto_usd=monto_usd, status="pendiente"
    )
    try:
        db.add(nuevo_ticket)
        db.commit()
        db.refresh(nuevo_ticket)
    except Exception:
        logger.exception("Error al registrar el pesaje")
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al registrar el pesaje.")
    return TicketResponse(
        id=nuevo_ticket.id, empresa_id=nuevo_ticket.empresa_id, usuario_id=nuevo_ticket.usuario_id,
        producto_id=nuevo_ticket.producto_id, cliente_id=nuevo_ticket.cliente_id,
        peso=nuevo_ticket.peso, monto_usd=nuevo_ticket.monto_usd, monto_ves=monto_ves,
        status=nuevo_ticket.status, created_at=nuevo_ticket.created_at,
        direccion_entrega=nuevo_ticket.direccion_entrega, repartidor_id=nuevo_ticket.repartidor_id,
        x=nuevo_ticket.coord_x, y=nuevo_ticket.coord_y,
        cliente=cliente.nombre if cliente else "Desconocido", direccion=nuevo_ticket.direccion_entrega
    )


@router.put("/api/v1/tickets/{ticket_id}/peso", tags=["Ventas"], response_model=TicketResponse)
def actualizar_peso_ticket(ticket_id: int, datos: TicketPesoUpdate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))):
    if datos.peso <= 0:
        raise HTTPException(status_code=400, detail="El peso debe ser mayor a cero.")
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id, Ticket.empresa_id == usuario_actual.eid, Ticket.status == "pendiente").first()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket no encontrado o no está en estatus pendiente.")
    producto = db.query(Producto).filter(Producto.id == ticket.producto_id).first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto asociado al ticket no encontrado.")
    ticket.peso = datos.peso
    ticket.monto_usd = (datos.peso * producto.precio_1_detalle).quantize(Decimal("0.01"))
    try:
        db.commit()
        db.refresh(ticket)
    except Exception:
        logger.exception("Error al modificar el peso del pesaje")
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al modificar el peso del pesaje.")
    cliente = db.query(Cliente).filter(Cliente.id == ticket.cliente_id).first()
    tasa = db.query(TasaCambio).filter(TasaCambio.empresa_id == usuario_actual.eid).first()
    tasa_bcv = tasa.valor_bcv if tasa else Decimal("0")
    return TicketResponse(
        id=ticket.id, empresa_id=ticket.empresa_id, usuario_id=ticket.usuario_id,
        producto_id=ticket.producto_id, cliente_id=ticket.cliente_id,
        peso=ticket.peso, monto_usd=ticket.monto_usd, monto_ves=(ticket.monto_usd * tasa_bcv).quantize(Decimal("0.01")),
        status=ticket.status, created_at=ticket.created_at, direccion_entrega=ticket.direccion_entrega,
        repartidor_id=ticket.repartidor_id, x=ticket.coord_x, y=ticket.coord_y,
        cliente=cliente.nombre if cliente else "Desconocido", direccion=ticket.direccion_entrega
    )


@router.put("/api/v1/tickets/{ticket_id}/cancelar", tags=["Ventas"])
def cancelar_ticket(ticket_id: int, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id, Ticket.empresa_id == usuario_actual.eid, Ticket.status == "pendiente").first()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket no encontrado o no está en estatus pendiente.")
    ticket.status = "cancelado"
    db.commit()
    return {"mensaje": "Ticket cancelado exitosamente.", "ticket_id": ticket_id}


@router.post("/api/v1/tickets/procesar-pago", tags=["Ventas"])
def procesar_pago_tickets(datos: ProcesarPagoTickets, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))):
    turno_activo = _requiere_turno_abierto(db, usuario_actual)
    tickets_procesados = []
    try:
        mod_map = {}
        if datos.modificaciones:
            for mod in datos.modificaciones:
                mod_map[mod.ticket_id] = mod.peso
        for tid in datos.ticket_ids:
            ticket = db.query(Ticket).filter(Ticket.id == tid, Ticket.empresa_id == usuario_actual.eid, Ticket.status == "pendiente").first()
            if not ticket:
                continue
            if ticket.id in mod_map:
                nuevo_peso = mod_map[ticket.id]
                producto = db.query(Producto).filter(Producto.id == ticket.producto_id).first()
                if producto:
                    ticket.peso = nuevo_peso
                    ticket.monto_usd = (nuevo_peso * producto.precio_1_detalle).quantize(Decimal("0.01"))
            lotes = db.query(Lote).filter(
                Lote.empresa_id == usuario_actual.eid, Lote.producto_id == ticket.producto_id,
                Lote.status == "activo", Lote.cantidad_actual > 0
            ).order_by(Lote.fecha_vencimiento.asc(), Lote.fecha_ingreso.asc()).all()
            stock_disponible = sum((lote.cantidad_actual for lote in lotes), Decimal("0"))
            if stock_disponible < ticket.peso:
                producto = db.query(Producto).filter(Producto.id == ticket.producto_id).first()
                nombre_p = producto.nombre if producto else f"ID {ticket.producto_id}"
                raise HTTPException(status_code=400, detail=f"Stock insuficiente en lotes para '{nombre_p}'. Disponible: {stock_disponible}, solicitado: {ticket.peso}")
            restante = ticket.peso
            for lote in lotes:
                if restante <= 0:
                    break
                descuento = min(lote.cantidad_actual, restante)
                lote.cantidad_actual -= descuento
                restante -= descuento
                if lote.cantidad_actual == 0:
                    lote.status = "agotado"
            ticket.status = "procesado"
            ticket.turno_id = turno_activo.id
            ticket.metodo_pago = datos.metodo_pago
            tickets_procesados.append(ticket)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        logger.exception("Error al procesar el cobro")
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al procesar el cobro.")
    return {"mensaje": "Cobro de balanza finalizado.", "tickets_actualizados": len(tickets_procesados)}


# ─────────────────────────────────────────────────────────────
# Turnos de Caja
# ─────────────────────────────────────────────────────────────
@router.get("/api/v1/caja/estado-turno", tags=["Caja - Turnos"], response_model=EstadoTurnoResponse)
def estado_turno_caja(db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))):
    turno = db.query(TurnoCaja).filter(TurnoCaja.empresa_id == usuario_actual.eid, TurnoCaja.usuario_id == usuario_actual.usuario_id, TurnoCaja.estado == EstadoTurno.ABIERTO).first()
    if not turno:
        return EstadoTurnoResponse(turno_abierto=False, turno=None)
    return EstadoTurnoResponse(turno_abierto=True, turno=_construir_turno_response(db, turno))


@router.post("/api/v1/caja/abrir-turno", tags=["Caja - Turnos"], response_model=TurnoCajaResponse, status_code=status.HTTP_201_CREATED)
def abrir_turno_caja(datos: AbrirTurnoRequest, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))):
    usuario = db.query(Usuario).filter(Usuario.id == usuario_actual.usuario_id, Usuario.empresa_id == usuario_actual.eid).first()
    if not usuario or usuario.email != datos.email or not verificar_password(datos.password, usuario.password_hash):
        raise HTTPException(status_code=401, detail="Email o contraseña incorrectos.")
    if usuario.rol not in ROLES_TURNO_CAJA:
        raise HTTPException(status_code=403, detail="Tu rol no está autorizado para abrir un turno de caja.")
    existente = db.query(TurnoCaja).filter(TurnoCaja.empresa_id == usuario_actual.eid, TurnoCaja.usuario_id == usuario_actual.usuario_id, TurnoCaja.estado == EstadoTurno.ABIERTO).first()
    if existente:
        raise HTTPException(status_code=400, detail="Ya tienes un turno de caja abierto.")
    nuevo_turno = TurnoCaja(empresa_id=usuario_actual.eid, usuario_id=usuario_actual.usuario_id, estado=EstadoTurno.ABIERTO, monto_inicial_usd=datos.monto_inicial_usd, monto_inicial_ves=datos.monto_inicial_ves)
    db.add(nuevo_turno)
    try:
        db.commit()
        db.refresh(nuevo_turno)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Ya tienes un turno de caja abierto.")
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="No se pudo abrir el turno de caja.")
    return _construir_turno_response(db, nuevo_turno)


@router.post("/api/v1/auth/autorizar-supervisor", tags=["Caja - Turnos"], response_model=AutorizarSupervisorResponse)
def autorizar_supervisor(datos: AutorizarSupervisorRequest, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))):
    supervisor = db.query(Usuario).filter(Usuario.email == datos.email, Usuario.empresa_id == usuario_actual.eid).first()
    if not supervisor or not verificar_password(datos.password, supervisor.password_hash):
        raise HTTPException(status_code=401, detail="Email o contraseña incorrectos.")
    if supervisor.rol not in ROLES_AUTORIZA_PRECIO:
        raise HTTPException(status_code=403, detail="Se requiere un usuario con rol Gerente o Propietario.")
    token = crear_token_autorizacion_precio(empresa_id=usuario_actual.eid, supervisor_id=supervisor.id)
    return AutorizarSupervisorResponse(autorizado=True, token=token, supervisor_nombre=supervisor.nombre, rol=supervisor.rol)


@router.post("/api/v1/caja/cerrar-turno", tags=["Caja - Turnos"], response_model=TurnoCajaResponse)
def cerrar_turno_caja(datos: CerrarTurnoRequest, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))):
    turno = db.query(TurnoCaja).filter(TurnoCaja.empresa_id == usuario_actual.eid, TurnoCaja.usuario_id == usuario_actual.usuario_id, TurnoCaja.estado == EstadoTurno.ABIERTO).first()
    if not turno:
        raise HTTPException(status_code=400, detail="No tienes un turno de caja abierto para cerrar.")
    esperado_usd, esperado_ves, _ = _calcular_esperado_y_desglose(db, usuario_actual.eid, turno)
    turno.monto_esperado_usd = esperado_usd
    turno.monto_esperado_ves = esperado_ves
    turno.monto_real_usd = datos.monto_real_usd
    turno.monto_real_ves = datos.monto_real_ves
    turno.estado = EstadoTurno.CERRADO
    turno.fecha_cierre = datetime.datetime.now()
    try:
        db.commit()
        db.refresh(turno)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="No se pudo cerrar el turno de caja.")
    return _construir_turno_response(db, turno)


# ─────────────────────────────────────────────────────────────
# Delivery y Órdenes de Compra
# ─────────────────────────────────────────────────────────────
@router.post("/api/v1/pedidos", tags=["Delivery"], response_model=PedidoDeliveryResponse, status_code=status.HTTP_201_CREATED)
def crear_pedido_delivery(datos: PedidoDeliveryCreate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))):
    x, y = lat_lng_to_svg(datos.destino_lat, datos.destino_lng)
    nuevo_pedido = PedidoDelivery(
        empresa_id=usuario_actual.eid, cliente_nombre=datos.cliente_nombre,
        cliente_telefono=datos.cliente_telefono, cliente_direccion=datos.cliente_direccion,
        vehiculo_id=datos.vehiculo_id, chofer_cedula=datos.chofer_cedula,
        origen=datos.origen, origen_lat=datos.origen_lat, origen_lng=datos.origen_lng,
        destino=datos.destino, destino_lat=datos.destino_lat, destino_lng=datos.destino_lng,
        distancia_km=datos.distancia_km, eta_min=datos.eta_min, estado=datos.estado,
        metodo_pago=datos.metodo_pago, monto_total=datos.monto_total, notas=datos.notas,
        coord_x=x, coord_y=y
    )
    try:
        db.add(nuevo_pedido)
        db.commit()
        db.refresh(nuevo_pedido)
    except Exception:
        logger.exception("Error al crear el pedido de delivery")
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al crear el pedido de delivery.")
    return nuevo_pedido


@router.get("/api/v1/pedidos", tags=["Delivery"], response_model=List[PedidoDeliveryResponse])
def listar_pedidos_delivery(estado: Optional[str] = None, chofer_cedula: Optional[str] = None, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))):
    query = db.query(PedidoDelivery).filter(PedidoDelivery.empresa_id == usuario_actual.eid)
    if estado:
        query = query.filter(PedidoDelivery.estado == estado)
    if chofer_cedula:
        query = query.filter(PedidoDelivery.chofer_cedula == chofer_cedula)
    return query.order_by(PedidoDelivery.created_at.desc()).all()


@router.put("/api/v1/pedidos/{pedido_id}/estado", tags=["Delivery"], response_model=PedidoDeliveryResponse)
def actualizar_estado_pedido(pedido_id: int, datos: PedidoDeliveryEstadoUpdate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))):
    if datos.estado not in ESTADOS_PEDIDO_VALIDOS:
        raise HTTPException(status_code=400, detail=f"Estado inválido. Use uno de: {', '.join(sorted(ESTADOS_PEDIDO_VALIDOS))}.")
    pedido = db.query(PedidoDelivery).filter(PedidoDelivery.id == pedido_id, PedidoDelivery.empresa_id == usuario_actual.eid).first()
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido de delivery no encontrado o no pertenece a su empresa.")
    pedido.estado = datos.estado
    try:
        db.commit()
        db.refresh(pedido)
    except Exception:
        logger.exception("Error al actualizar el estado del pedido")
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al actualizar el estado del pedido.")
    return pedido


@router.post("/api/v1/pedidos/guardar-auditado", tags=["Compras"], response_model=OrdenCompraResponse, status_code=status.HTTP_201_CREATED)
def crear_orden_compra(datos: OrdenCompraCreate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))):
    if not datos.items:
        raise HTTPException(status_code=400, detail="La orden de compra debe incluir al menos un producto.")
    total_usd = sum((item.cantidad * item.costo for item in datos.items), 0.0)
    nueva_orden = OrdenCompra(empresa_id=usuario_actual.eid, proveedor=datos.proveedor, items_count=len(datos.items), total_usd=total_usd, origen="Borrador Auditado", estatus="Pendiente")
    try:
        db.add(nueva_orden)
        db.flush()
        for item in datos.items:
            db.add(OrdenCompraItem(orden_id=nueva_orden.id, producto_nombre=item.nombre, cantidad=item.cantidad, costo=item.costo))
        db.commit()
        db.refresh(nueva_orden)
    except Exception:
        logger.exception("Error al registrar la orden de compra")
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al registrar la orden de compra.")
    return nueva_orden


@router.get("/api/v1/pedidos/ordenes", tags=["Compras"], response_model=List[OrdenCompraResponse])
def listar_ordenes_compra(db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))):
    return db.query(OrdenCompra).filter(OrdenCompra.empresa_id == usuario_actual.eid).order_by(OrdenCompra.created_at.desc()).all()
