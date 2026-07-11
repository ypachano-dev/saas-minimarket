"""
Router: Tesorería y Cartera — Cuentas de Tesorería, Movimientos, Resumen de Bancos, Cartera CxC / CxP, Gestión de Cobranzas y Gastos Fijos.
"""
import calendar
import datetime
import logging
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.security import get_current_user, verificar_rol
from app.db.session import SessionLocal
from app.models.tasa import TasaCambio
from app.models.tesoreria import CuentaTesoreria, MovimientoTesoreria
from app.models.cartera import CuentaPorCobrar, CuentaPorPagar, PagoCxc
from app.models.cobranza import GestionCobranza
from app.models.renglon_gasto import RenglonGasto, PagoRenglon
from app.models.usuario import Usuario
from app.models.cliente import Cliente
from app.models.proveedor import Proveedor
from app.schemas import (
    TokenData,
    CuentaTesoreriaCreate, CuentaTesoreriaUpdateSaldo, CuentaTesoreriaResponse,
    MovimientoTesoreriaCreate, MovimientoTesoreriaResponse, SaldoPorCuentaItem, ResumenTesoreriaResponse,
    CuentaPorCobrarCreate, CuentaPorCobrarResponse, CuentaPorPagarCreate, CuentaPorPagarResponse,
    AbonoCreate, ResumenCarteraResponse, PendienteCobroItem, PagoRecienteItem, HistorialPagoResponse,
    GestionCobranzaCreate, GestionCobranzaRespuestaUpdate, GestionCobranzaSaveResponse,
    RenglonGastoCreate, RenglonGastoUpdate, RenglonGastoResponse,
    PagoRenglonCreate, PagoRenglonResponse
)

logger = logging.getLogger("app")
router = APIRouter()

ROLES_GESTION = ["admin", "propietario"]
ROLES_LECTURA_CARTERA = ["admin", "propietario", "vendedor"]
METODOS_PAGO_CAJA = ["Efectivo $", "Efectivo Bs", "Zelle", "Pago Móvil", "Punto de Venta", "Transferencia"]
METODO_PAGO_VES = "Efectivo Bs"


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _tasa_bcv_empresa(db: Session, empresa_id: int) -> Decimal:
    tasa = db.query(TasaCambio).filter(TasaCambio.empresa_id == empresa_id).first()
    return tasa.valor_bcv if tasa else Decimal("0")


def _tasa_eur_empresa(db: Session, empresa_id: int) -> Decimal:
    tasa = db.query(TasaCambio).filter(TasaCambio.empresa_id == empresa_id).first()
    return (tasa.valor_eur or Decimal("0")) if tasa else Decimal("0")


def _calcular_resumen_tesoreria(db: Session, empresa_id: int) -> ResumenTesoreriaResponse:
    tasa_obj = db.query(TasaCambio).filter(TasaCambio.empresa_id == empresa_id).first()
    tasa_bcv = tasa_obj.valor_bcv if tasa_obj else Decimal("0")
    tasa_eur = (tasa_obj.valor_eur or Decimal("0")) if tasa_obj else Decimal("0")
    cuentas = db.query(CuentaTesoreria).filter(CuentaTesoreria.empresa_id == empresa_id, CuentaTesoreria.status == "activa").all()
    items = []
    total_usd = Decimal("0")
    total_eur = Decimal("0")
    for c in cuentas:
        if c.moneda == "VES" and tasa_bcv > 0:
            eq_usd = (c.saldo_actual / tasa_bcv).quantize(Decimal("0.01"))
        elif c.moneda == "VES":
            eq_usd = Decimal("0")
        elif c.moneda == "EUR":
            eq_usd = (c.saldo_actual * tasa_eur / tasa_bcv).quantize(Decimal("0.01")) if tasa_bcv > 0 else c.saldo_actual
        else:
            eq_usd = c.saldo_actual.quantize(Decimal("0.01"))

        if c.moneda == "VES" and tasa_eur > 0:
            eq_eur = (c.saldo_actual / tasa_eur).quantize(Decimal("0.01"))
        elif c.moneda == "EUR":
            eq_eur = c.saldo_actual.quantize(Decimal("0.01"))
        elif c.moneda == "USD" and tasa_eur > 0 and tasa_bcv > 0:
            eq_eur = (c.saldo_actual * tasa_bcv / tasa_eur).quantize(Decimal("0.01"))
        else:
            eq_eur = eq_usd
        total_usd += eq_usd
        total_eur += eq_eur
        items.append(SaldoPorCuentaItem(
            cuenta_id=c.id, banco=c.banco, alias=c.alias, moneda=c.moneda,
            saldo_actual=c.saldo_actual, saldo_usd_equivalente=eq_usd,
            saldo_eur_equivalente=eq_eur, saldo_cargado_por=c.saldo_cargado_por,
            saldo_fecha=c.saldo_fecha,
        ))
    return ResumenTesoreriaResponse(
        saldo_total_usd_equivalente=total_usd, saldo_total_eur_equivalente=total_eur,
        tasa_bcv=tasa_bcv, tasa_eur=tasa_eur, cuentas=items,
    )


def _status_cuenta(monto_total: Decimal, monto_abonado: Decimal) -> str:
    if monto_abonado >= monto_total:
        return "pagada"
    if monto_abonado > 0:
        return "parcial"
    return "pendiente"


def _calcular_resumen_cartera(db: Session, empresa_id: int) -> ResumenCarteraResponse:
    hoy = datetime.date.today()
    cxc_abiertas = db.query(CuentaPorCobrar).filter(CuentaPorCobrar.empresa_id == empresa_id, CuentaPorCobrar.status != "pagada").all()
    total_cxc = sum((c.monto_total - c.monto_abonado for c in cxc_abiertas), Decimal("0"))
    cxc_vencidas = [c for c in cxc_abiertas if c.fecha_vencimiento < hoy]
    total_cxc_vencido = sum((c.monto_total - c.monto_abonado for c in cxc_vencidas), Decimal("0"))
    cxp_abiertas = db.query(CuentaPorPagar).filter(CuentaPorPagar.empresa_id == empresa_id, CuentaPorPagar.status != "pagada").all()
    total_cxp = sum((c.monto_total - c.monto_abonado for c in cxp_abiertas), Decimal("0"))
    cxp_vencidas = [c for c in cxp_abiertas if c.fecha_vencimiento < hoy]
    total_cxp_vencido = sum((c.monto_total - c.monto_abonado for c in cxp_vencidas), Decimal("0"))
    return ResumenCarteraResponse(
        total_por_cobrar=total_cxc, total_por_cobrar_vencido=total_cxc_vencido, cuentas_por_cobrar_vencidas=len(cxc_vencidas),
        total_por_pagar=total_cxp, total_por_pagar_vencido=total_cxp_vencido, cuentas_por_pagar_vencidas=len(cxp_vencidas)
    )


def _rango_periodo_actual(frecuencia: str, hoy: datetime.date) -> tuple[datetime.date, datetime.date, str]:
    if frecuencia == "semanal":
        inicio = hoy - datetime.timedelta(days=hoy.weekday())
        fin = inicio + datetime.timedelta(days=6)
        return inicio, fin, f"Semana del {inicio.strftime('%d/%m')}"
    if frecuencia == "quincenal":
        ultimo_dia_mes = calendar.monthrange(hoy.year, hoy.month)[1]
        if hoy.day <= 15:
            inicio, fin = hoy.replace(day=1), hoy.replace(day=15)
        else:
            inicio, fin = hoy.replace(day=16), hoy.replace(day=ultimo_dia_mes)
        return inicio, fin, f"Quincena {inicio.strftime('%d/%m')} - {fin.strftime('%d/%m')}"
    if frecuencia == "unico":
        return datetime.date(2000, 1, 1), datetime.date(2100, 1, 1), "Pago único"
    ultimo_dia_mes = calendar.monthrange(hoy.year, hoy.month)[1]
    inicio, fin = hoy.replace(day=1), hoy.replace(day=ultimo_dia_mes)
    meses_es = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
    return inicio, fin, f"{meses_es[inicio.month - 1].capitalize()} {inicio.year}"


def _renglon_a_response(db: Session, r: RenglonGasto) -> RenglonGastoResponse:
    inicio, fin, periodo_label = _rango_periodo_actual(r.frecuencia, datetime.date.today())
    pagado = Decimal(str(
        db.query(func.coalesce(func.sum(PagoRenglon.monto_usd), 0))
        .filter(PagoRenglon.renglon_id == r.id, PagoRenglon.fecha_pago >= inicio, PagoRenglon.fecha_pago <= fin)
        .scalar()
    ))
    return RenglonGastoResponse(
        id=r.id, nombre=r.nombre, categoria=r.categoria, monto_esperado_usd=r.monto_esperado_usd,
        frecuencia=r.frecuencia, activo=r.activo, periodo_label=periodo_label,
        monto_pagado_periodo=pagado, saldo_pendiente_periodo=max(Decimal("0"), r.monto_esperado_usd - pagado),
    )


# ─────────────────────────────────────────────────────────────
# Cuentas Bancarias y Tesorería
# ─────────────────────────────────────────────────────────────
@router.post("/api/v1/tesoreria/cuentas", tags=["Tesorería"], response_model=CuentaTesoreriaResponse, status_code=status.HTTP_201_CREATED)
def crear_cuenta_tesoreria(datos: CuentaTesoreriaCreate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))):
    banco_val = datos.banco.strip().upper()[:40]
    if not banco_val:
        raise HTTPException(status_code=400, detail="El banco/medio de pago es obligatorio.")
    usuario = db.query(Usuario).filter(Usuario.id == usuario_actual.usuario_id).first()
    nombre_usuario = usuario.nombre if usuario else "Sistema"
    nueva_cuenta = CuentaTesoreria(
        empresa_id=usuario_actual.eid, banco=banco_val, alias=datos.alias.strip(),
        moneda=datos.moneda.strip().upper(), numero_referencia=datos.numero_referencia.strip() if datos.numero_referencia else None,
        saldo_actual=datos.saldo_actual, saldo_cargado_por=nombre_usuario, saldo_fecha=datetime.datetime.now(datetime.timezone.utc),
    )
    try:
        db.add(nueva_cuenta)
        db.commit()
        db.refresh(nueva_cuenta)
    except Exception:
        logger.exception("Error al registrar la cuenta")
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al registrar la cuenta.")
    return nueva_cuenta


@router.patch("/api/v1/tesoreria/cuentas/{cuenta_id}/saldo", tags=["Tesorería"], response_model=CuentaTesoreriaResponse)
def ajustar_saldo_cuenta(cuenta_id: int, datos: CuentaTesoreriaUpdateSaldo, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))):
    cuenta = db.query(CuentaTesoreria).filter(CuentaTesoreria.id == cuenta_id, CuentaTesoreria.empresa_id == usuario_actual.eid).first()
    if not cuenta:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada.")
    if datos.saldo_nuevo < 0:
        raise HTTPException(status_code=400, detail="El saldo no puede ser negativo.")
    usuario = db.query(Usuario).filter(Usuario.id == usuario_actual.usuario_id).first()
    nombre_usuario = usuario.nombre if usuario else "Sistema"
    ahora = datetime.datetime.now(datetime.timezone.utc)
    diferencia = datos.saldo_nuevo - cuenta.saldo_actual
    tipo_mov = "ingreso" if diferencia >= 0 else "egreso"
    mov = MovimientoTesoreria(
        empresa_id=usuario_actual.eid, cuenta_id=cuenta.id, usuario_id=usuario_actual.usuario_id,
        tipo=tipo_mov, monto=abs(diferencia), concepto=f"[Ajuste] {datos.concepto}", created_at=ahora,
    )
    db.add(mov)
    cuenta.saldo_actual = datos.saldo_nuevo
    cuenta.saldo_cargado_por = nombre_usuario
    cuenta.saldo_fecha = ahora
    try:
        db.commit()
        db.refresh(cuenta)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al ajustar el saldo.")
    return cuenta


@router.get("/api/v1/tesoreria/cuentas", tags=["Tesorería"], response_model=List[CuentaTesoreriaResponse])
def listar_cuentas_tesoreria(db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))):
    return db.query(CuentaTesoreria).filter(CuentaTesoreria.empresa_id == usuario_actual.eid).order_by(CuentaTesoreria.created_at.desc()).all()


@router.post("/api/v1/tesoreria/movimientos", tags=["Tesorería"], response_model=MovimientoTesoreriaResponse, status_code=status.HTTP_201_CREATED)
def crear_movimiento_tesoreria(datos: MovimientoTesoreriaCreate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))):
    if datos.tipo not in ("ingreso", "egreso"):
        raise HTTPException(status_code=400, detail="El tipo de movimiento debe ser 'ingreso' o 'egreso'.")
    if datos.monto <= 0:
        raise HTTPException(status_code=400, detail="El monto debe ser mayor a cero.")
    cuenta = db.query(CuentaTesoreria).filter(CuentaTesoreria.id == datos.cuenta_id, CuentaTesoreria.empresa_id == usuario_actual.eid).first()
    if not cuenta:
        raise HTTPException(status_code=404, detail="La cuenta indicada no existe o no pertenece a su empresa.")
    if datos.tipo == "egreso" and datos.monto > cuenta.saldo_actual:
        raise HTTPException(status_code=400, detail=f"Saldo insuficiente en '{cuenta.alias}'. Disponible: {cuenta.saldo_actual}.")
    nuevo_movimiento = MovimientoTesoreria(
        empresa_id=usuario_actual.eid, cuenta_id=cuenta.id, usuario_id=usuario_actual.usuario_id,
        tipo=datos.tipo, monto=datos.monto, concepto=datos.concepto.strip()
    )
    if datos.tipo == "ingreso":
        cuenta.saldo_actual += datos.monto
    else:
        cuenta.saldo_actual -= datos.monto
    try:
        db.add(nuevo_movimiento)
        db.commit()
        db.refresh(nuevo_movimiento)
    except Exception:
        logger.exception("Error al registrar el movimiento")
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al registrar el movimiento.")
    return nuevo_movimiento


@router.get("/api/v1/tesoreria/movimientos", tags=["Tesorería"], response_model=List[MovimientoTesoreriaResponse])
def listar_movimientos_tesoreria(cuenta_id: Optional[int] = None, skip: int = 0, limit: int = 100, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))):
    query = db.query(MovimientoTesoreria).filter(MovimientoTesoreria.empresa_id == usuario_actual.eid)
    if cuenta_id:
        query = query.filter(MovimientoTesoreria.cuenta_id == cuenta_id)
    return query.order_by(MovimientoTesoreria.created_at.desc()).offset(skip).limit(limit).all()


@router.get("/api/v1/tesoreria/resumen", tags=["Tesorería"], response_model=ResumenTesoreriaResponse)
def resumen_tesoreria(db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))):
    return _calcular_resumen_tesoreria(db, usuario_actual.eid)


# ─────────────────────────────────────────────────────────────
# Cartera CxC (Cuentas por Cobrar)
# ─────────────────────────────────────────────────────────────
@router.post("/api/v1/cartera/cxc", tags=["Cartera"], response_model=CuentaPorCobrarResponse, status_code=status.HTTP_201_CREATED)
def crear_cxc(datos: CuentaPorCobrarCreate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))):
    cliente = db.query(Cliente).filter(Cliente.id == datos.cliente_id, Cliente.empresa_id == usuario_actual.eid).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado.")
    if datos.monto_total <= 0:
        raise HTTPException(status_code=400, detail="El monto debe ser mayor a cero.")
    nueva = CuentaPorCobrar(
        empresa_id=usuario_actual.eid, cliente_id=cliente.id, monto_total=datos.monto_total, monto_abonado=Decimal("0"),
        fecha_emision=datos.fecha_emision or datetime.date.today(), fecha_vencimiento=datos.fecha_vencimiento,
        status="pendiente", notas=datos.notes if hasattr(datos, 'notes') else getattr(datos, 'notas', None)
    )
    try:
        db.add(nueva)
        db.commit()
        db.refresh(nueva)
    except Exception:
        logger.exception("Error al registrar la cuenta por cobrar")
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al registrar la cuenta por cobrar.")
    return CuentaPorCobrarResponse(
        id=nueva.id, empresa_id=nueva.empresa_id, cliente_id=nueva.cliente_id, cliente_nombre=cliente.nombre,
        monto_total=nueva.monto_total, monto_abonado=nueva.monto_abonado, saldo=nueva.monto_total - nueva.monto_abonado,
        fecha_emision=nueva.fecha_emision, fecha_vencimiento=nueva.fecha_vencimiento, status=nueva.status,
        notas=nueva.notas, created_at=nueva.created_at
    )


@router.get("/api/v1/cartera/cxc", tags=["Cartera"], response_model=List[CuentaPorCobrarResponse])
def listar_cxc(status_filtro: Optional[str] = None, cliente_id: Optional[int] = None, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_LECTURA_CARTERA))):
    query = db.query(CuentaPorCobrar, Cliente.nombre).join(Cliente, Cliente.id == CuentaPorCobrar.cliente_id).filter(CuentaPorCobrar.empresa_id == usuario_actual.eid)
    if status_filtro:
        query = query.filter(CuentaPorCobrar.status == status_filtro)
    if cliente_id:
        query = query.filter(CuentaPorCobrar.cliente_id == cliente_id)
    filas = query.order_by(CuentaPorCobrar.fecha_vencimiento.asc()).all()
    return [
        CuentaPorCobrarResponse(
            id=c.id, empresa_id=c.empresa_id, cliente_id=c.cliente_id, cliente_nombre=nombre,
            monto_total=c.monto_total, monto_abonado=c.monto_abonado, saldo=c.monto_total - c.monto_abonado,
            fecha_emision=c.fecha_emision, fecha_vencimiento=c.fecha_vencimiento, status=c.status,
            notas=c.notas, created_at=c.created_at
        )
        for c, nombre in filas
    ]


@router.post("/api/v1/cartera/cxc/{cxc_id}/abono", tags=["Cartera"], response_model=CuentaPorCobrarResponse)
def abonar_cxc(cxc_id: int, datos: AbonoCreate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))):
    cxc = db.query(CuentaPorCobrar).filter(CuentaPorCobrar.id == cxc_id, CuentaPorCobrar.empresa_id == usuario_actual.eid).first()
    if not cxc:
        raise HTTPException(status_code=404, detail="Cuenta por cobrar no encontrada.")
    if datos.monto <= 0:
        raise HTTPException(status_code=400, detail="El abono debe ser mayor a cero.")
    saldo_actual = cxc.monto_total - cxc.monto_abonado
    if datos.monto > saldo_actual:
        raise HTTPException(status_code=400, detail=f"El abono excede el saldo pendiente ({saldo_actual}).")
    cxc.monto_abonado += datos.monto
    cxc.status = _status_cuenta(cxc.monto_total, cxc.monto_abonado)
    db.add(PagoCxc(empresa_id=usuario_actual.eid, cxc_id=cxc.id, cliente_id=cxc.cliente_id, monto=datos.monto))
    try:
        db.commit()
        db.refresh(cxc)
    except Exception:
        logger.exception("Error al registrar el abono")
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al registrar el abono.")
    cliente = db.query(Cliente).filter(Cliente.id == cxc.cliente_id).first()
    return CuentaPorCobrarResponse(
        id=cxc.id, empresa_id=cxc.empresa_id, cliente_id=cxc.cliente_id, cliente_nombre=cliente.nombre if cliente else None,
        monto_total=cxc.monto_total, monto_abonado=cxc.monto_abonado, saldo=cxc.monto_total - cxc.monto_abonado,
        fecha_emision=cxc.fecha_emision, fecha_vencimiento=cxc.fecha_vencimiento, status=cxc.status,
        notas=cxc.notas, created_at=cxc.created_at
    )


# ─────────────────────────────────────────────────────────────
# Gestión de Cobranzas
# ─────────────────────────────────────────────────────────────
@router.post("/api/v1/cobranzas/gestion-cobranza", tags=["Cobranzas"], response_model=GestionCobranzaSaveResponse, status_code=status.HTTP_201_CREATED)
def crear_gestion_cobranza(datos: GestionCobranzaCreate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_LECTURA_CARTERA))):
    cliente = db.query(Cliente).filter(Cliente.id == datos.cliente_id, Cliente.empresa_id == usuario_actual.eid).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado o no pertenece a la empresa.")
    nueva = GestionCobranza(
        empresa_id=usuario_actual.eid, cliente_id=datos.cliente_id, vendedor_id=usuario_actual.usuario_id,
        tipo=datos.tipo, fecha_programada=datos.fecha_programada or datetime.datetime.now(),
    )
    db.add(nueva)
    db.commit()
    db.refresh(nueva)
    return GestionCobranzaSaveResponse(status="success", gestion_id=nueva.id)


@router.put("/api/v1/cobranzas/gestion-cobranza/{gestion_id}/respuesta", tags=["Cobranzas"], response_model=GestionCobranzaSaveResponse)
def responder_gestion_cobranza(gestion_id: int, datos: GestionCobranzaRespuestaUpdate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_LECTURA_CARTERA))):
    gestion = db.query(GestionCobranza).filter(GestionCobranza.id == gestion_id, GestionCobranza.empresa_id == usuario_actual.eid).first()
    if not gestion:
        raise HTTPException(status_code=404, detail="Gestión de cobranza no encontrada.")
    gestion.respuesta_cliente = datos.respuesta_cliente
    gestion.efectiva = datos.efectiva
    gestion.fecha_respuesta = datetime.datetime.now()
    db.commit()
    return GestionCobranzaSaveResponse(status="success", gestion_id=gestion.id)


# ─────────────────────────────────────────────────────────────
# Cartera CxP (Cuentas por Pagar)
# ─────────────────────────────────────────────────────────────
@router.post("/api/v1/cartera/cxp", tags=["Cartera"], response_model=CuentaPorPagarResponse, status_code=status.HTTP_201_CREATED)
def crear_cxp(datos: CuentaPorPagarCreate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))):
    proveedor = db.query(Proveedor).filter(Proveedor.id == datos.proveedor_id, Proveedor.empresa_id == usuario_actual.eid).first()
    if not proveedor:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado.")
    if datos.monto_total <= 0:
        raise HTTPException(status_code=400, detail="El monto debe ser mayor a cero.")
    nueva = CuentaPorPagar(
        empresa_id=usuario_actual.eid, proveedor_id=proveedor.id, monto_total=datos.monto_total, monto_abonado=Decimal("0"),
        fecha_emision=datos.fecha_emision or datetime.date.today(), fecha_vencimiento=datos.fecha_vencimiento,
        status="pendiente", notas=datos.notas
    )
    try:
        db.add(nueva)
        db.commit()
        db.refresh(nueva)
    except Exception:
        logger.exception("Error al registrar la cuenta por pagar")
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al registrar la cuenta por pagar.")
    return CuentaPorPagarResponse(
        id=nueva.id, empresa_id=nueva.empresa_id, proveedor_id=nueva.proveedor_id, proveedor_nombre=proveedor.nombre,
        monto_total=nueva.monto_total, monto_abonado=nueva.monto_abonado, saldo=nueva.monto_total - nueva.monto_abonado,
        fecha_emision=nueva.fecha_emision, fecha_vencimiento=nueva.fecha_vencimiento, status=nueva.status,
        notas=nueva.notas, created_at=nueva.created_at
    )


@router.get("/api/v1/cartera/cxp", tags=["Cartera"], response_model=List[CuentaPorPagarResponse])
def listar_cxp(status_filtro: Optional[str] = None, proveedor_id: Optional[int] = None, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))):
    query = db.query(CuentaPorPagar, Proveedor.nombre).join(Proveedor, Proveedor.id == CuentaPorPagar.proveedor_id).filter(CuentaPorPagar.empresa_id == usuario_actual.eid)
    if status_filtro:
        query = query.filter(CuentaPorPagar.status == status_filtro)
    if proveedor_id:
        query = query.filter(CuentaPorPagar.proveedor_id == proveedor_id)
    filas = query.order_by(CuentaPorPagar.fecha_vencimiento.asc()).all()
    return [
        CuentaPorPagarResponse(
            id=c.id, empresa_id=c.empresa_id, proveedor_id=c.proveedor_id, proveedor_nombre=nombre,
            monto_total=c.monto_total, monto_abonado=c.monto_abonado, saldo=c.monto_total - c.monto_abonado,
            fecha_emision=c.fecha_emision, fecha_vencimiento=c.fecha_vencimiento, status=c.status,
            notas=c.notas, created_at=c.created_at
        )
        for c, nombre in filas
    ]


@router.post("/api/v1/cartera/cxp/{cxp_id}/abono", tags=["Cartera"], response_model=CuentaPorPagarResponse)
def abonar_cxp(cxp_id: int, datos: AbonoCreate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))):
    cxp = db.query(CuentaPorPagar).filter(CuentaPorPagar.id == cxp_id, CuentaPorPagar.empresa_id == usuario_actual.eid).first()
    if not cxp:
        raise HTTPException(status_code=404, detail="Cuenta por pagar no encontrada.")
    if datos.monto <= 0:
        raise HTTPException(status_code=400, detail="El abono debe ser mayor a cero.")
    saldo_actual = cxp.monto_total - cxp.monto_abonado
    if datos.monto > saldo_actual:
        raise HTTPException(status_code=400, detail=f"El abono excede el saldo pendiente ({saldo_actual}).")
    cxp.monto_abonado += datos.monto
    cxp.status = _status_cuenta(cxp.monto_total, cxp.monto_abonado)
    try:
        db.commit()
        db.refresh(cxp)
    except Exception:
        logger.exception("Error al registrar el abono")
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al registrar el abono.")
    proveedor = db.query(Proveedor).filter(Proveedor.id == cxp.proveedor_id).first()
    return CuentaPorPagarResponse(
        id=cxp.id, empresa_id=cxp.empresa_id, proveedor_id=cxp.proveedor_id, proveedor_nombre=proveedor.nombre if proveedor else None,
        monto_total=cxp.monto_total, monto_abonado=cxp.monto_abonado, saldo=cxp.monto_total - cxp.monto_abonado,
        fecha_emision=cxp.fecha_emision, fecha_vencimiento=cxp.fecha_vencimiento, status=cxp.status,
        notas=cxp.notes if hasattr(cxp, 'notes') else getattr(cxp, 'notas', None), created_at=cxp.created_at
    )


@router.get("/api/v1/cartera/resumen", tags=["Cartera"], response_model=ResumenCarteraResponse)
def resumen_cartera(db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))):
    return _calcular_resumen_cartera(db, usuario_actual.eid)


# ─────────────────────────────────────────────────────────────
# Gastos Fijos
# ─────────────────────────────────────────────────────────────
@router.post("/api/v1/gastos-fijos/renglones", tags=["Gastos Fijos"], response_model=RenglonGastoResponse, status_code=status.HTTP_201_CREATED)
def crear_renglon_gasto(datos: RenglonGastoCreate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))):
    if not datos.nombre.strip():
        raise HTTPException(status_code=400, detail="El nombre del renglón es obligatorio.")
    nuevo = RenglonGasto(empresa_id=usuario_actual.eid, nombre=datos.nombre.strip(), categoria=datos.categoria, monto_esperado_usd=datos.monto_esperado_usd, frecuencia=datos.frecuencia, activo=True)
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return _renglon_a_response(db, nuevo)


@router.get("/api/v1/gastos-fijos/renglones", tags=["Gastos Fijos"], response_model=List[RenglonGastoResponse])
def listar_renglones_gasto(incluir_inactivos: bool = False, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))):
    query = db.query(RenglonGasto).filter(RenglonGasto.empresa_id == usuario_actual.eid)
    if not incluir_inactivos:
        query = query.filter(RenglonGasto.activo == True)
    renglones = query.order_by(RenglonGasto.categoria.asc(), RenglonGasto.nombre.asc()).all()
    return [_renglon_a_response(db, r) for r in renglones]


@router.patch("/api/v1/gastos-fijos/renglones/{renglon_id}", tags=["Gastos Fijos"], response_model=RenglonGastoResponse)
def actualizar_renglon_gasto(renglon_id: int, datos: RenglonGastoUpdate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))):
    renglon = db.query(RenglonGasto).filter(RenglonGasto.id == renglon_id, RenglonGasto.empresa_id == usuario_actual.eid).first()
    if not renglon:
        raise HTTPException(status_code=404, detail="Renglón de gasto no encontrado.")
    for campo, valor in datos.model_dump(exclude_unset=True).items():
        setattr(renglon, campo, valor)
    db.commit()
    db.refresh(renglon)
    return _renglon_a_response(db, renglon)


@router.post("/api/v1/gastos-fijos/renglones/{renglon_id}/pagos", tags=["Gastos Fijos"], response_model=PagoRenglonResponse, status_code=status.HTTP_201_CREATED)
def registrar_pago_renglon(renglon_id: int, datos: PagoRenglonCreate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))):
    renglon = db.query(RenglonGasto).filter(RenglonGasto.id == renglon_id, RenglonGasto.empresa_id == usuario_actual.eid).first()
    if not renglon:
        raise HTTPException(status_code=404, detail="Renglón de gasto no encontrado.")
    if datos.monto_usd <= 0:
        raise HTTPException(status_code=400, detail="El monto del pago debe ser mayor a cero.")
    nuevo_pago = PagoRenglon(
        empresa_id=usuario_actual.eid, renglon_id=renglon.id, monto_usd=datos.monto_usd,
        fecha_pago=datos.fecha_pago or datetime.date.today(), comprobante_url=datos.comprobante_url,
        observaciones=datos.observaciones, registrado_por_id=usuario_actual.usuario_id,
    )
    db.add(nuevo_pago)
    db.commit()
    db.refresh(nuevo_pago)
    usuario_reg = db.query(Usuario).filter(Usuario.id == usuario_actual.usuario_id).first()
    return PagoRenglonResponse(
        id=nuevo_pago.id, renglon_id=renglon.id, renglon_nombre=renglon.nombre,
        monto_usd=nuevo_pago.monto_usd, fecha_pago=nuevo_pago.fecha_pago,
        comprobante_url=nuevo_pago.comprobante_url, observaciones=nuevo_pago.observaciones,
        registrado_por_nombre=usuario_reg.nombre if usuario_reg else None, created_at=nuevo_pago.created_at,
    )


@router.get("/api/v1/gastos-fijos/pagos", tags=["Gastos Fijos"], response_model=List[PagoRenglonResponse])
def listar_pagos_renglon(renglon_id: Optional[int] = None, limite: int = 50, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))):
    query = db.query(PagoRenglon, RenglonGasto.nombre, Usuario.nombre).join(RenglonGasto, RenglonGasto.id == PagoRenglon.renglon_id).outerjoin(Usuario, Usuario.id == PagoRenglon.registrado_por_id).filter(PagoRenglon.empresa_id == usuario_actual.eid)
    if renglon_id:
        query = query.filter(PagoRenglon.renglon_id == renglon_id)
    filas = query.order_by(PagoRenglon.fecha_pago.desc(), PagoRenglon.created_at.desc()).limit(limite).all()
    return [
        PagoRenglonResponse(
            id=p.id, renglon_id=p.renglon_id, renglon_nombre=nombre_renglon,
            monto_usd=p.monto_usd, fecha_pago=p.fecha_pago, comprobante_url=p.comprobante_url,
            observaciones=p.observaciones, registrado_por_nombre=nombre_usuario, created_at=p.created_at,
        )
        for p, nombre_renglon, nombre_usuario in filas
    ]
