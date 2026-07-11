"""
Router: Facturación SENIAT
Emisión de facturas fiscales, listado y relación con Caja y Presupuestos.
"""
import datetime
import logging
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, and_

from app.core.security import get_current_user, verificar_rol
from app.db.session import SessionLocal
from app.models.factura import Factura, FacturaItem
from app.models.cliente import Cliente
from app.models.producto import Producto
from app.models.tasa import TasaCambio
from app.models.lote import Lote
from app.models.orden_venta import OrdenVenta
from app.models.ticket import Ticket
from app.models.empresa import Empresa
from app.schemas import TokenData, FacturaCreate, FacturaResponse, FacturaItemResponse
from app.core.facturacion_config import ModalidadFacturacion, normalizar_modalidad_facturacion

logger = logging.getLogger("app")
router = APIRouter()

ROLES_FACTURACION = ["cajero", "admin", "propietario"]

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/api/v1/facturas", tags=["Facturación SENIAT"], response_model=FacturaResponse, status_code=status.HTTP_201_CREATED)
def crear_factura(datos: FacturaCreate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_FACTURACION))):
    cliente = db.query(Cliente).filter(Cliente.id == datos.cliente_id, Cliente.empresa_id == usuario_actual.eid).first()
    if not cliente:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado.")

    empresa = db.query(Empresa).filter(Empresa.id == usuario_actual.eid).first()
    if not empresa:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada.")
    modalidad = normalizar_modalidad_facturacion(empresa.modalidad_facturacion)

    tasa = db.query(TasaCambio).filter(TasaCambio.empresa_id == usuario_actual.eid).first()
    if not tasa:
        raise HTTPException(status_code=400, detail="Debe configurar la tasa de cambio BCV antes de facturar.")
    tasa_bcv = tasa.valor_bcv

    # El Nro. de Control NUNCA lo genera el software: en modalidad "imprenta" debe
    # coincidir con el formato pre-impreso por la imprenta autorizada (dentro del
    # rango asignado); en "maquina_fiscal" es el comprobante que ya emitió la
    # impresora fiscal. El Nro. de Factura (uso interno) sí sigue siendo correlativo.
    nro_control_manual = (datos.nro_control_manual or "").strip()
    if not nro_control_manual:
        raise HTTPException(status_code=400, detail="Debe indicar el Número de Control de la factura fiscal.")

    if modalidad == ModalidadFacturacion.IMPRENTA:
        if not empresa.imprenta_control_desde or not empresa.imprenta_control_hasta:
            raise HTTPException(
                status_code=400,
                detail="Configure primero el rango de Números de Control asignado por su imprenta autorizada, en Configuración.",
            )
        digitos = "".join(ch for ch in nro_control_manual if ch.isdigit())
        if not digitos:
            raise HTTPException(status_code=400, detail="El Número de Control indicado no es válido.")
        valor_numerico = int(digitos)
        if not (empresa.imprenta_control_desde <= valor_numerico <= empresa.imprenta_control_hasta):
            raise HTTPException(
                status_code=400,
                detail=f"El Número de Control debe estar dentro del rango asignado por la imprenta ({empresa.imprenta_control_desde:08d} - {empresa.imprenta_control_hasta:08d}).",
            )

    ya_usado = db.query(Factura).filter(Factura.empresa_id == usuario_actual.eid, Factura.nro_control == nro_control_manual).first()
    if ya_usado:
        raise HTTPException(status_code=400, detail="Ese Número de Control ya fue utilizado en otra factura.")

    nro_control = nro_control_manual

    # Nro. de Factura: correlativo interno de uso administrativo (no fiscal)
    cant_facturas = db.query(func.count(Factura.id)).filter(Factura.empresa_id == usuario_actual.eid).scalar() or 0
    nro_factura = f"{cant_facturas + 1:08d}"

    # Estructuras para acumular montos SENIAT
    monto_exento_usd = Decimal("0.00")
    monto_imponible_usd = Decimal("0.00")
    monto_iva_usd = Decimal("0.00")
    total_usd = Decimal("0.00")
    items_creados = []

    # Validar si viene de tickets de Caja (POS)
    es_desde_caja = bool(datos.ticket_ids)

    # Validar si viene de presupuesto
    es_desde_presupuesto = bool(datos.presupuesto_id)

    # Si es directo o desde presupuesto, debemos descontar inventario
    # Si es desde Caja/POS, el inventario YA se descontó al emitir el ticket en Caja.
    descuenta_inventario = not es_desde_caja

    # 1. Resolver ítems
    lineas_items = []
    if es_desde_caja:
        # Cargar ítems a partir de los tickets seleccionados
        tickets = db.query(Ticket).filter(
            Ticket.id.in_(datos.ticket_ids),
            Ticket.empresa_id == usuario_actual.eid,
            Ticket.cliente_id == datos.cliente_id
        ).all()
        if not tickets:
            raise HTTPException(status_code=400, detail="No se encontraron tickets de Caja válidos para este cliente.")
        
        # Agrupar por producto para consolidar en la factura
        agrupado = {}
        for t in tickets:
            if t.producto_id not in agrupado:
                # Obtener producto
                prod = db.query(Producto).filter(Producto.id == t.producto_id).first()
                if not prod:
                    continue
                agrupado[t.producto_id] = {
                    "producto_id": t.producto_id,
                    "cantidad": Decimal("0.000"),
                    "precio_unitario_usd": t.monto_usd / t.peso if t.peso > 0 else Decimal("0.00"),
                    "aplica_iva": getattr(prod, "aplica_iva", True)
                }
            agrupado[t.producto_id]["cantidad"] += t.peso
        
        lineas_items = list(agrupado.values())

    elif es_desde_presupuesto:
        # Cargar de un presupuesto
        presupuesto = db.query(OrdenVenta).filter(
            OrdenVenta.id == datos.presupuesto_id,
            OrdenVenta.empresa_id == usuario_actual.eid,
            OrdenVenta.tipo == "presupuesto"
        ).first()
        if not presupuesto:
            raise HTTPException(status_code=404, detail="Presupuesto no encontrado.")
        if presupuesto.estatus == "procesado":
            raise HTTPException(status_code=400, detail="Este presupuesto ya ha sido procesado o facturado previamente.")
        
        for item in presupuesto.items:
            prod = db.query(Producto).filter(Producto.id == item.producto_id).first()
            aplica_iva = getattr(prod, "aplica_iva", True) if prod else True
            lineas_items.append({
                "producto_id": item.producto_id,
                "cantidad": item.cantidad,
                "precio_unitario_usd": item.precio_unitario,
                "aplica_iva": aplica_iva
            })
    else:
        # Factura directa manual
        for item in datos.items:
            lineas_items.append({
                "producto_id": item.producto_id,
                "cantidad": item.cantidad,
                "precio_unitario_usd": item.precio_unitario_usd,
                "aplica_iva": item.aplica_iva
            })

    if not lineas_items:
        raise HTTPException(status_code=400, detail="La factura debe incluir al menos un producto.")

    try:
        # 2. Registrar factura cabecera preliminar
        nueva_factura = Factura(
            empresa_id=usuario_actual.eid,
            usuario_id=usuario_actual.usuario_id,
            cliente_id=datos.cliente_id,
            nro_factura=nro_factura,
            nro_control=nro_control,
            modalidad_facturacion=modalidad.value,
            cliente_nombre=cliente.nombre,
            cliente_rif=cliente.cedula,
            cliente_direccion=cliente.direccion,
            tasa_bcv=tasa_bcv,
            presupuesto_id=datos.presupuesto_id,
            monto_exento_usd=Decimal("0.00"),
            monto_imponible_usd=Decimal("0.00"),
            monto_iva_usd=Decimal("0.00"),
            total_usd=Decimal("0.00"),
            total_ves=Decimal("0.00")
        )
        db.add(nueva_factura)
        db.flush() # Para obtener nueva_factura.id

        # 3. Procesar ítems e inventario
        for item_data in lineas_items:
            producto = db.query(Producto).filter(
                Producto.id == item_data["producto_id"],
                Producto.empresa_id == usuario_actual.eid
            ).first()
            if not producto:
                raise HTTPException(status_code=404, detail=f"Producto {item_data['producto_id']} no encontrado.")

            cantidad = item_data["cantidad"]
            precio = item_data["precio_unitario_usd"]

            # Descontar stock de lotes si aplica
            if descuenta_inventario:
                lotes = db.query(Lote).filter(
                    Lote.empresa_id == usuario_actual.eid,
                    Lote.producto_id == producto.id,
                    Lote.status == "activo",
                    Lote.cantidad_actual > 0
                ).order_by(Lote.fecha_vencimiento.asc(), Lote.fecha_ingreso.asc()).all()
                stock = sum((l.cantidad_actual for l in lotes), Decimal("0"))
                if stock < cantidad:
                    raise HTTPException(status_code=400, detail=f"Stock insuficiente para '{producto.nombre}'. Disponible: {stock}, solicitado: {cantidad}")
                
                restante = cantidad
                for lote in lotes:
                    if restante <= 0:
                        break
                    descuento = min(lote.cantidad_actual, restante)
                    lote.cantidad_actual -= descuento
                    restante -= descuento
                    if lote.cantidad_actual == 0:
                        lote.status = "agotado"

            # Cálculos de impuestos SENIAT
            subtotal = (cantidad * precio).quantize(Decimal("0.01"))
            aplica_iva = item_data["aplica_iva"]
            iva_pct = Decimal("16.00") if aplica_iva else Decimal("0.00")
            
            if aplica_iva:
                monto_imponible_usd += subtotal
                monto_iva_usd += (subtotal * (iva_pct / Decimal("100.00"))).quantize(Decimal("0.01"))
            else:
                monto_exento_usd += subtotal

            fact_item = FacturaItem(
                factura_id=nueva_factura.id,
                producto_id=producto.id,
                cantidad=cantidad,
                precio_unitario_usd=precio,
                aplica_iva=aplica_iva,
                iva_porcentaje=iva_pct,
                subtotal_usd=subtotal
            )
            db.add(fact_item)
            items_creados.append(fact_item)

        # 4. Actualizar totales cabecera
        total_usd = monto_exento_usd + monto_imponible_usd + monto_iva_usd
        total_ves = (total_usd * tasa_bcv).quantize(Decimal("0.01"))

        nueva_factura.monto_exento_usd = monto_exento_usd
        nueva_factura.monto_imponible_usd = monto_imponible_usd
        nueva_factura.monto_iva_usd = monto_iva_usd
        nueva_factura.total_usd = total_usd
        nueva_factura.total_ves = total_ves

        # Si viene de presupuesto, marcarlo como procesado
        if es_desde_presupuesto:
            presupuesto = db.query(OrdenVenta).filter(OrdenVenta.id == datos.presupuesto_id).first()
            if presupuesto:
                presupuesto.estatus = "procesado"

        # Si viene de Caja, asociar los tickets a la factura y marcarlos como procesados/facturados
        if es_desde_caja:
            tickets = db.query(Ticket).filter(Ticket.id.in_(datos.ticket_ids)).all()
            for t in tickets:
                t.factura_id = nueva_factura.id

        db.commit()
        db.refresh(nueva_factura)

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        logger.exception("Error al emitir factura fiscal")
        db.rollback()
        raise HTTPException(status_code=400, detail="Error interno al registrar la factura fiscal.")

    # Convertir a respuesta con producto_nombre
    items_resp = []
    for item in nueva_factura.items:
        prod = db.query(Producto).filter(Producto.id == item.producto_id).first()
        items_resp.append(FacturaItemResponse(
            id=item.id,
            producto_id=item.producto_id,
            producto_nombre=prod.nombre if prod else "Producto Desconocido",
            cantidad=item.cantidad,
            precio_unitario_usd=item.precio_unitario_usd,
            aplica_iva=item.aplica_iva,
            iva_porcentaje=item.iva_porcentaje,
            subtotal_usd=item.subtotal_usd
        ))

    return FacturaResponse(
        id=nueva_factura.id,
        empresa_id=nueva_factura.empresa_id,
        usuario_id=nueva_factura.usuario_id,
        cliente_id=nueva_factura.cliente_id,
        nro_factura=nueva_factura.nro_factura,
        nro_control=nueva_factura.nro_control,
        modalidad_facturacion=nueva_factura.modalidad_facturacion,
        cliente_nombre=nueva_factura.cliente_nombre,
        cliente_rif=nueva_factura.cliente_rif,
        cliente_direccion=nueva_factura.cliente_direccion,
        tasa_bcv=nueva_factura.tasa_bcv,
        monto_exento_usd=nueva_factura.monto_exento_usd,
        monto_imponible_usd=nueva_factura.monto_imponible_usd,
        monto_iva_usd=nueva_factura.monto_iva_usd,
        total_usd=nueva_factura.total_usd,
        total_ves=nueva_factura.total_ves,
        presupuesto_id=nueva_factura.presupuesto_id,
        created_at=nueva_factura.created_at,
        items=items_resp
    )


@router.get("/api/v1/facturas", tags=["Facturación SENIAT"], response_model=List[FacturaResponse])
def listar_facturas(db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_FACTURACION))):
    facturas = db.query(Factura).filter(Factura.empresa_id == usuario_actual.eid).order_by(Factura.created_at.desc()).all()
    resp = []
    for f in facturas:
        items_resp = []
        for item in f.items:
            prod = db.query(Producto).filter(Producto.id == item.producto_id).first()
            items_resp.append(FacturaItemResponse(
                id=item.id,
                producto_id=item.producto_id,
                producto_nombre=prod.nombre if prod else "Producto Desconocido",
                cantidad=item.cantidad,
                precio_unitario_usd=item.precio_unitario_usd,
                aplica_iva=item.aplica_iva,
                iva_porcentaje=item.iva_porcentaje,
                subtotal_usd=item.subtotal_usd
            ))
        resp.append(FacturaResponse(
            id=f.id,
            empresa_id=f.empresa_id,
            usuario_id=f.usuario_id,
            cliente_id=f.cliente_id,
            nro_factura=f.nro_factura,
            nro_control=f.nro_control,
            modalidad_facturacion=f.modalidad_facturacion,
            cliente_nombre=f.cliente_nombre,
            cliente_rif=f.cliente_rif,
            cliente_direccion=f.cliente_direccion,
            tasa_bcv=f.tasa_bcv,
            monto_exento_usd=f.monto_exento_usd,
            monto_imponible_usd=f.monto_imponible_usd,
            monto_iva_usd=f.monto_iva_usd,
            total_usd=f.total_usd,
            total_ves=f.total_ves,
            presupuesto_id=f.presupuesto_id,
            created_at=f.created_at,
            items=items_resp
        ))
    return resp


@router.get("/api/v1/facturas/{id}", tags=["Facturación SENIAT"], response_model=FacturaResponse)
def obtener_factura(id: int, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_FACTURACION))):
    f = db.query(Factura).filter(Factura.id == id, Factura.empresa_id == usuario_actual.eid).first()
    if not f:
        raise HTTPException(status_code=404, detail="Factura no encontrada.")
    
    items_resp = []
    for item in f.items:
        prod = db.query(Producto).filter(Producto.id == item.producto_id).first()
        items_resp.append(FacturaItemResponse(
            id=item.id,
            producto_id=item.producto_id,
            producto_nombre=prod.nombre if prod else "Producto Desconocido",
            cantidad=item.cantidad,
            precio_unitario_usd=item.precio_unitario_usd,
            aplica_iva=item.aplica_iva,
            iva_porcentaje=item.iva_porcentaje,
            subtotal_usd=item.subtotal_usd
        ))
    return FacturaResponse(
        id=f.id,
        empresa_id=f.empresa_id,
        usuario_id=f.usuario_id,
        cliente_id=f.cliente_id,
        nro_factura=f.nro_factura,
        nro_control=f.nro_control,
        modalidad_facturacion=f.modalidad_facturacion,
        cliente_nombre=f.cliente_nombre,
        cliente_rif=f.cliente_rif,
        cliente_direccion=f.cliente_direccion,
        tasa_bcv=f.tasa_bcv,
        monto_exento_usd=f.monto_exento_usd,
        monto_imponible_usd=f.monto_imponible_usd,
        monto_iva_usd=f.monto_iva_usd,
        total_usd=f.total_usd,
        total_ves=f.total_ves,
        presupuesto_id=f.presupuesto_id,
        created_at=f.created_at,
        items=items_resp
    )


@router.get("/api/v1/facturas-presupuestos-disponibles", tags=["Facturación SENIAT"])
def listar_presupuestos_disponibles(db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_FACTURACION))):
    presupuestos = db.query(OrdenVenta).filter(
        OrdenVenta.empresa_id == usuario_actual.eid,
        OrdenVenta.tipo == "presupuesto",
        OrdenVenta.estatus == "pendiente"
    ).order_by(OrdenVenta.created_at.desc()).all()
    resp = []
    for p in presupuestos:
        cliente = db.query(Cliente).filter(Cliente.id == p.cliente_id).first()
        items_detalles = []
        for it in p.items:
            prod = db.query(Producto).filter(Producto.id == it.producto_id).first()
            items_detalles.append({
                "producto_id": it.producto_id,
                "producto_nombre": prod.nombre if prod else "Producto Desconocido",
                "cantidad": it.cantidad,
                "precio_unitario": it.precio_unitario,
                "monto_usd": it.monto_usd
            })
        resp.append({
            "id": p.id,
            "cliente_id": p.cliente_id,
            "cliente_nombre": cliente.nombre if cliente else "Desconocido",
            "cliente_rif": cliente.cedula if cliente else "",
            "total_usd": p.total_usd,
            "created_at": p.created_at,
            "items": items_detalles
        })
    return resp


@router.get("/api/v1/facturas-tickets-disponibles", tags=["Facturación SENIAT"])
def listar_tickets_disponibles(cliente_id: Optional[int] = None, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_FACTURACION))):
    query = db.query(Ticket).filter(
        Ticket.empresa_id == usuario_actual.eid,
        Ticket.status == "procesado",
        Ticket.factura_id == None
    )
    if cliente_id is not None:
        query = query.filter(Ticket.cliente_id == cliente_id)
        
    tickets = query.order_by(Ticket.created_at.desc()).all()
    resp = []
    for t in tickets:
        prod = db.query(Producto).filter(Producto.id == t.producto_id).first()
        cliente = db.query(Cliente).filter(Cliente.id == t.cliente_id).first()
        resp.append({
            "id": t.id,
            "cliente_id": t.cliente_id,
            "cliente_nombre": cliente.nombre if cliente else "Desconocido",
            "cliente_rif": cliente.cedula if cliente else "",
            "producto_id": t.producto_id,
            "producto_nombre": prod.nombre if prod else "Producto Desconocido",
            "peso": t.peso,
            "monto_usd": t.monto_usd,
            "created_at": t.created_at
        })
    return resp
