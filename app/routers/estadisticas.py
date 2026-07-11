"""
Router: Estadísticas y Reportes — Dashboard de KPIs, Proyecciones de Stock, Ventas por Departamento/Rubro y Análisis de Rendimiento.
"""
import calendar
import datetime
import logging
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, and_
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.security import get_current_user, verificar_rol
from app.db.session import SessionLocal
from app.models.tasa import TasaCambio
from app.models.ticket import Ticket
from app.models.producto import Producto
from app.models.lote import Lote
from app.models.merma import Merma
from app.models.cliente import Cliente
from app.schemas import (
    TokenData,
    VentasHoyResponse, StockBajoItem, LoteCriticoItem, ResumenMermasResponse, DashboardResponse,
    VentaDiariaItem, ProductoTopItem, VentaPorDepartamentoItem, EstadisticasResumenResponse,
    MetricaDepartamentoItem, DashboardAvanzadoResponse, ClienteTopItem, RubroDetalleResponse
)

logger = logging.getLogger("app")
router = APIRouter()

ROLES_GESTION = ["admin", "propietario"]


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _stock_total_por_producto(db: Session, empresa_id: int):
    filas = (
        db.query(Producto.id, func.coalesce(func.sum(Lote.cantidad_actual), 0).label("stock_total"))
        .outerjoin(Lote, and_(Lote.producto_id == Producto.id, Lote.empresa_id == empresa_id, Lote.status == "activo"))
        .filter(Producto.empresa_id == empresa_id, Producto.status == True)
        .group_by(Producto.id).all()
    )
    return {fila.id: Decimal(str(fila.stock_total)) for fila in filas}


def _calcular_estadisticas(db: Session, empresa_id: int) -> EstadisticasResumenResponse:
    hoy = datetime.date.today()
    hace_30_dias = hoy - datetime.timedelta(days=30)
    filas_ventas = (
        db.query(func.date(Ticket.created_at).label("fecha"), func.sum(Ticket.monto_usd).label("monto"))
        .filter(Ticket.empresa_id == empresa_id, Ticket.status == "procesado", func.date(Ticket.created_at) >= hace_30_dias)
        .group_by(func.date(Ticket.created_at)).order_by(func.date(Ticket.created_at)).all()
    )
    ventas_30d = [VentaDiariaItem(fecha=datetime.date.fromisoformat(str(f.fecha)), monto_usd=Decimal(str(f.monto))) for f in filas_ventas]
    filas_top = (
        db.query(Producto.id, Producto.nombre, func.sum(Ticket.peso).label("cantidad"), func.sum(Ticket.monto_usd).label("monto"))
        .join(Ticket, Ticket.producto_id == Producto.id)
        .filter(Ticket.empresa_id == empresa_id, Ticket.status == "procesado", func.date(Ticket.created_at) >= hace_30_dias)
        .group_by(Producto.id, Producto.nombre).order_by(func.sum(Ticket.monto_usd).desc()).limit(10).all()
    )
    top_productos = [ProductoTopItem(producto_id=f.id, nombre=f.nombre, cantidad_vendida=Decimal(str(f.cantidad)), monto_usd=Decimal(str(f.monto))) for f in filas_top]
    filas_dept = (
        db.query(Producto.linea, func.sum(Ticket.monto_usd).label("monto"))
        .join(Ticket, Ticket.producto_id == Producto.id)
        .filter(Ticket.empresa_id == empresa_id, Ticket.status == "procesado", func.date(Ticket.created_at) >= hace_30_dias)
        .group_by(Producto.linea).order_by(func.sum(Ticket.monto_usd).desc()).all()
    )
    ventas_dept = [VentaPorDepartamentoItem(departamento=f.linea or "General", monto_usd=Decimal(str(f.monto))) for f in filas_dept]
    primer_dia_mes_actual = hoy.replace(day=1)
    if primer_dia_mes_actual.month == 1:
        primer_dia_mes_anterior = primer_dia_mes_actual.replace(year=primer_dia_mes_actual.year - 1, month=12)
    else:
        primer_dia_mes_anterior = primer_dia_mes_actual.replace(month=primer_dia_mes_actual.month - 1)
    ventas_mes_actual = Decimal(str(db.query(func.coalesce(func.sum(Ticket.monto_usd), 0)).filter(
        Ticket.empresa_id == empresa_id, Ticket.status == "procesado", func.date(Ticket.created_at) >= primer_dia_mes_actual
    ).scalar()))
    ventas_mes_anterior = Decimal(str(db.query(func.coalesce(func.sum(Ticket.monto_usd), 0)).filter(
        Ticket.empresa_id == empresa_id, Ticket.status == "procesado",
        func.date(Ticket.created_at) >= primer_dia_mes_anterior, func.date(Ticket.created_at) < primer_dia_mes_actual
    ).scalar()))
    variacion_pct = None
    if ventas_mes_anterior > 0:
        variacion_pct = float(((ventas_mes_actual - ventas_mes_anterior) / ventas_mes_anterior) * 100)
    primer_dia_mes_dt = datetime.datetime.combine(primer_dia_mes_actual, datetime.time.min)
    mermas_mes = db.query(Merma, Producto.precio_1_detalle).join(Producto, Producto.id == Merma.producto_id).filter(Merma.empresa_id == empresa_id, Merma.created_at >= primer_dia_mes_dt).all()
    mermas_usd = sum((Decimal(str(m.cantidad)) * precio for m, precio in mermas_mes), Decimal("0"))
    stock_critico_rows = db.query(Producto.id).outerjoin(Lote, and_(Lote.producto_id == Producto.id, Lote.empresa_id == empresa_id, Lote.status == "activo")).filter(Producto.empresa_id == empresa_id, Producto.status == True).group_by(Producto.id).having(func.coalesce(func.sum(Lote.cantidad_actual), 0) <= 10).all()
    return EstadisticasResumenResponse(
        ventas_ultimos_30_dias=ventas_30d, top_productos=top_productos, ventas_por_departamento=ventas_dept,
        ventas_mes_actual_usd=ventas_mes_actual, ventas_mes_anterior_usd=ventas_mes_anterior,
        variacion_pct=variacion_pct, mermas_mes_usd_equivalente=mermas_usd.quantize(Decimal("0.01")),
        productos_stock_critico=len(stock_critico_rows)
    )


# ─────────────────────────────────────────────────────────────
# Endpoints de Dashboard y KPIs
# ─────────────────────────────────────────────────────────────
@router.get("/api/v1/reportes/dashboard", tags=["Reportes"], response_model=DashboardResponse)
def obtener_dashboard(db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))):
    empresa_id = usuario_actual.eid
    hoy = datetime.date.today()
    tasa = db.query(TasaCambio).filter(TasaCambio.empresa_id == empresa_id).first()
    tasa_bcv = tasa.valor_bcv if tasa else Decimal("0")
    ventas_usd = db.query(func.coalesce(func.sum(Ticket.monto_usd), 0)).filter(
        Ticket.empresa_id == empresa_id, Ticket.status == "procesado", func.date(Ticket.created_at) == hoy
    ).scalar()
    ventas_usd = Decimal(str(ventas_usd))
    ventas_ves = (ventas_usd * tasa_bcv).quantize(Decimal("0.01"))
    stock_bajo_rows = (
        db.query(Producto.id, Producto.codigo_interno, Producto.nombre, func.coalesce(func.sum(Lote.cantidad_actual), 0).label("stock_total"))
        .outerjoin(Lote, and_(Lote.producto_id == Producto.id, Lote.empresa_id == empresa_id, Lote.status == "activo"))
        .filter(Producto.empresa_id == empresa_id, Producto.status == True)
        .group_by(Producto.id, Producto.codigo_interno, Producto.nombre)
        .having(func.coalesce(func.sum(Lote.cantidad_actual), 0) <= 10).all()
    )
    alertas_stock_bajo = [StockBajoItem(producto_id=row.id, codigo_interno=row.codigo_interno, nombre=row.nombre, stock_total=Decimal(str(row.stock_total))) for row in stock_bajo_rows]
    limite_vencimiento = hoy + datetime.timedelta(days=30)
    lotes_criticos = (
        db.query(Lote, Producto.nombre).join(Producto, Producto.id == Lote.producto_id)
        .filter(Lote.empresa_id == empresa_id, Lote.status == "activo", Lote.fecha_vencimiento <= limite_vencimiento)
        .order_by(Lote.fecha_vencimiento.asc()).all()
    )
    alertas_vencimiento = [
        LoteCriticoItem(
            lote_id=lote.id, producto_id=lote.producto_id, producto_nombre=producto_nombre,
            codigo_lote=lote.codigo_lote, cantidad_actual=lote.cantidad_actual,
            fecha_vencimiento=lote.fecha_vencimiento, dias_restantes=(lote.fecha_vencimiento - hoy).days
        )
        for lote, producto_nombre in lotes_criticos
    ]
    primer_dia_mes = datetime.datetime.combine(hoy.replace(day=1), datetime.time.min)
    total_mermado, total_registros = db.query(func.coalesce(func.sum(Merma.cantidad), 0), func.count(Merma.id)).filter(
        Merma.empresa_id == empresa_id, Merma.created_at >= primer_dia_mes
    ).one()
    motivo_row = (
        db.query(Merma.motivo, func.count(Merma.id).label("total"))
        .filter(Merma.empresa_id == empresa_id, Merma.created_at >= primer_dia_mes)
        .group_by(Merma.motivo).order_by(func.count(Merma.id).desc()).first()
    )
    motivo_mas_frecuente = motivo_row[0] if motivo_row else None
    return DashboardResponse(
        tasa_bcv=tasa_bcv, ventas_hoy=VentasHoyResponse(monto_usd=ventas_usd, monto_ves=ventas_ves),
        alertas_stock_bajo=alertas_stock_bajo, alertas_vencimiento=alertas_vencimiento,
        resumen_mermas_mes=ResumenMermasResponse(cantidad_total_mermada=Decimal(str(total_mermado)), total_registros=total_registros, motivo_mas_frecuente=motivo_mas_frecuente)
    )


@router.get("/api/v1/estadisticas/resumen", tags=["Estadísticas"], response_model=EstadisticasResumenResponse)
def resumen_estadisticas(db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))):
    return _calcular_estadisticas(db, usuario_actual.eid)


@router.get("/api/v1/dashboard/avanzado", tags=["Dashboard"], response_model=DashboardAvanzadoResponse)
def dashboard_avanzado(desde: Optional[datetime.date] = None, hasta: Optional[datetime.date] = None, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))):
    hoy = datetime.date.today()
    desde_efectivo = desde or hoy.replace(day=1)
    hasta_efectivo = hasta or hoy
    empresa_id = usuario_actual.eid
    lineas_activas = db.query(Producto.linea).filter(Producto.empresa_id == empresa_id, Producto.status == True, Producto.linea.isnot(None)).distinct().all()
    lineas = sorted({l.linea for l in lineas_activas if l.linea})
    filtro_ventas = [Ticket.empresa_id == empresa_id, Ticket.status == "procesado", func.date(Ticket.created_at) >= desde_efectivo, func.date(Ticket.created_at) <= hasta_efectivo]
    filas_dept = db.query(Producto.linea, func.sum(Ticket.peso).label("kilos"), func.sum(Ticket.monto_usd).label("monto")).join(Ticket, Ticket.producto_id == Producto.id).filter(*filtro_ventas).group_by(Producto.linea).all()
    ventas_por_linea = {f.linea: f for f in filas_dept}
    filas_merma = db.query(Producto.linea, func.sum(Merma.cantidad).label("merma")).join(Merma, Merma.producto_id == Producto.id).filter(Merma.empresa_id == empresa_id, func.date(Merma.created_at) >= desde_efectivo, func.date(Merma.created_at) <= hasta_efectivo).group_by(Producto.linea).all()
    merma_por_linea = {f.linea: Decimal(str(f.merma)) for f in filas_merma}
    deptos = []
    for linea in lineas:
        f = ventas_por_linea.get(linea)
        kilos = Decimal(str(f.kilos)) if f and f.kilos is not None else Decimal("0")
        monto = Decimal(str(f.monto)) if f and f.monto is not None else Decimal("0")
        merma = merma_por_linea.get(linea, Decimal("0"))
        rendimiento = float(((kilos - merma) / kilos) * 100) if kilos > 0 else 0.0
        deptos.append(MetricaDepartamentoItem(
            linea=linea, nombre=linea, kilos_despachados=kilos, ventas_usd=monto, merma_kilos=merma, rendimiento=rendimiento, personal_comision=Decimal("0"),
        ))
    deptos.sort(key=lambda d: d.ventas_usd, reverse=True)
    return DashboardAvanzadoResponse(desde=desde_efectivo, hasta=hasta_efectivo, deptos=deptos, reponer=[], vencer=[])


@router.get("/api/v1/dashboard/rubro-detalle", tags=["Dashboard"], response_model=RubroDetalleResponse)
def dashboard_rubro_detalle(rubro: str, desde: Optional[datetime.date] = None, hasta: Optional[datetime.date] = None, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))):
    hoy = datetime.date.today()
    desde_efectivo = desde or hoy.replace(day=1)
    hasta_efectivo = hasta or hoy
    empresa_id = usuario_actual.eid
    filtro_base = [Ticket.empresa_id == empresa_id, Ticket.status == "procesado", Producto.linea == rubro, func.date(Ticket.created_at) >= desde_efectivo, func.date(Ticket.created_at) <= hasta_efectivo]
    top_por_monto = db.query(Producto.id, Producto.nombre, func.sum(Ticket.peso).label("cantidad"), func.sum(Ticket.monto_usd).label("monto")).join(Ticket, Ticket.producto_id == Producto.id).filter(*filtro_base).group_by(Producto.id, Producto.nombre).order_by(func.sum(Ticket.monto_usd).desc()).limit(10).all()
    top_por_cantidad = db.query(Producto.id, Producto.nombre, func.sum(Ticket.peso).label("cantidad"), func.sum(Ticket.monto_usd).label("monto")).join(Ticket, Ticket.producto_id == Producto.id).filter(*filtro_base).group_by(Producto.id, Producto.nombre).order_by(func.sum(Ticket.peso).desc()).limit(10).all()
    mejor_cliente_rows = db.query(Cliente.id, Cliente.nombre, func.sum(Ticket.monto_usd).label("monto"), func.count(Ticket.id).label("compras")).join(Ticket, Ticket.cliente_id == Cliente.id).join(Producto, Producto.id == Ticket.producto_id).filter(*filtro_base).group_by(Cliente.id, Cliente.nombre).order_by(func.sum(Ticket.monto_usd).desc()).limit(5).all()
    totales = db.query(func.coalesce(func.sum(Ticket.monto_usd), 0).label("monto_total"), func.coalesce(func.sum(Ticket.peso), 0).label("kilos_total"), func.count(Ticket.id).label("tickets_total")).join(Producto, Producto.id == Ticket.producto_id).filter(*filtro_base).first()
    return RubroDetalleResponse(
        rubro=rubro, desde=desde_efectivo, hasta=hasta_efectivo,
        monto_total_usd=Decimal(str(totales.monto_total)), kilos_total=Decimal(str(totales.kilos_total)), tickets_total=totales.tickets_total,
        top_productos_por_monto=[ProductoTopItem(producto_id=r.id, nombre=r.nombre, cantidad_vendida=Decimal(str(r.cantidad)), monto_usd=Decimal(str(r.monto))) for r in top_por_monto],
        top_productos_por_cantidad=[ProductoTopItem(producto_id=r.id, nombre=r.nombre, cantidad_vendida=Decimal(str(r.cantidad)), monto_usd=Decimal(str(r.monto))) for r in top_por_cantidad],
        mejores_clientes=[ClienteTopItem(cliente_id=r.id, nombre=r.nombre, monto_usd=Decimal(str(r.monto)), num_compras=r.compras) for r in mejor_cliente_rows],
    )
