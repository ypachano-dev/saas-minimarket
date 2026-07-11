"""
Router: Agentes IA — VALE (Analítica), YHORGE (Cobranza y Tesorería), ALO (Ventas, CRM y Campañas) e Inteligencia con LLM.
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
from app.core.ai_agent import consultar_agente
from app.models.empresa import Empresa
from app.models.plan import Plan
from app.models.cartera import CuentaPorCobrar, CuentaPorPagar, PagoCxc
from app.models.cliente import Cliente
from app.models.ticket import Ticket
from app.models.producto import Producto
from app.models.merma import Merma
from app.models.lote import Lote
from app.models.tesoreria import CuentaTesoreria
from app.models.visita import VisitaCliente, EncuestaInventarioItem
from app.models.orden_venta import OrdenVenta
from app.core.negocio_config import NEGOCIO_CONFIG, normalizar_tipo_negocio, GUIAS_AGENTES_IA
from app.schemas import (
    TokenData,
    AgenteConsulta, AgenteRespuesta, AloConsulta,
    CampanaAloRequest, CampanaAloResponse, CampanaAloItem,
    CampanaProductoRequest, CampanaProductoResponse, CandidatoProductoItem,
    VentaDiariaItem, ProductoTopItem, VentaPorDepartamentoItem, EstadisticasResumenResponse
)

logger = logging.getLogger("app")
router = APIRouter()

ROLES_GESTION = ["admin", "propietario"]
ROLES_OPERACION = ["cajero", "admin", "propietario", "repartidor", "vendedor"]
SEGMENTOS_CRM = ["VIP", "Activo", "En Riesgo", "Inactivo", "Nuevo"]

VALE_SYSTEM_PROMPT = (
    "Eres VALE, la analista de datos senior de 3Q Nexus ERP. Tu trabajo es leer las cifras reales "
    "del negocio que se te entregan en el contexto (ventas, productos, mermas, stock) y producir un "
    "análisis breve, directo y en español venezolano, con 3 a 5 hallazgos concretos y al menos 2 "
    "recomendaciones de acción accionables (qué producto reabastecer, qué precio ajustar, qué día de "
    "la semana reforzar personal, etc.). Nunca inventes cifras que no estén en el contexto. Si los datos "
    "son insuficientes, dilo explícitamente. Sé conciso: máximo 200 palabras."
)

YHORGE_SYSTEM_PROMPT = (
    "Eres YHORGE, el especialista en cobranza y tesorería de 3Q Nexus ERP. Recibes en el contexto "
    "las cuentas por cobrar (clientes que deben), cuentas por pagar (proveedores), los saldos de las "
    "cuentas bancarias y el detalle de las cuentas vencidas más urgentes con su cliente y teléfono. Tu "
    "trabajo es priorizar a quién cobrar primero (por monto y días de vencimiento), alertar si el flujo "
    "de caja está ajustado para cubrir las cuentas por pagar próximas, y sugerir un mensaje corto, cordial "
    "pero firme para enviar por WhatsApp al cliente con la deuda más urgente. Responde en español "
    "venezolano, tono profesional pero cercano, máximo 200 palabras."
)

ALO_SYSTEM_PROMPT = (
    "Eres ALO, el asistente de ventas y gestión de clientes de 3Q Nexus ERP. Tienes visión 360° de "
    "cada cliente: su historial de compras, su saldo pendiente en cartera (CxC), sus visitas de campo y "
    "encuestas de mercadeo (si el negocio tiene vendedores de ruta), y sus presupuestos/pedidos recientes. "
    "Puedes hacer dos cosas según lo que se te pida:\n"
    "1. Si te piden redactar un mensaje (faltante, reactivación, recordatorio de pago, seguimiento de "
    "visita, oferta), redacta un mensaje corto, cálido y persuasivo en español venezolano, listo para "
    "enviar por WhatsApp, que salude al cliente por su nombre y use datos reales del contexto. Máximo 80 "
    "palabras, sin emojis excesivos (máximo 2). Devuelve solo el mensaje, sin explicaciones.\n"
    "2. Si te hacen una pregunta libre sobre el cliente (ej. '¿debe algo?', '¿cuándo fue su última "
    "visita?', '¿qué le sugiero vender?'), respóndela de forma directa y breve (máximo 100 palabras) "
    "usando solo los datos del contexto. Nunca inventes cifras, fechas o productos que no estén ahí; si "
    "falta información para responder, dilo explícitamente."
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def requiere_guia_ia(nombre_guia: str, roles_permitidos: list[str] = ROLES_GESTION):
    if nombre_guia not in GUIAS_AGENTES_IA:
        raise ValueError(f"Guía de IA desconocida: {nombre_guia}")
    modulo_requerido = GUIAS_AGENTES_IA[nombre_guia]
    def dependencia(usuario_actual: TokenData = Depends(verificar_rol(roles_permitidos)), db: Session = Depends(get_db)) -> TokenData:
        empresa = db.query(Empresa).filter(Empresa.id == usuario_actual.eid).first()
        if not empresa:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada.")
        if not empresa.plan_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tu empresa no tiene asignado un plan de suscripción activo.")
        plan = db.query(Plan).filter(Plan.id == empresa.plan_id).first()
        if not plan:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="El plan de suscripción de tu empresa no es válido.")
        agente_incluido = getattr(plan, f"agente_{nombre_guia}_incluido", False)
        if not agente_incluido:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"El agente de IA '{nombre_guia.upper()}' no está incluido en tu plan actual.")
        tipo_negocio = normalizar_tipo_negocio(empresa.tipo_negocio)
        modulos_activos = NEGOCIO_CONFIG[tipo_negocio]["modulos_base"]
        if modulo_requerido not in modulos_activos:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"La guía '{nombre_guia.upper()}' no está habilitada para el sector de tu empresa.")
        if not getattr(empresa, f"agente_{nombre_guia}_activo", True):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"La guía '{nombre_guia.upper()}' está desactivada para tu empresa.")
        return usuario_actual
    return dependencia


# ─────────────────────────────────────────────────────────────
# Helper functions for stats
# ─────────────────────────────────────────────────────────────
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


def _calcular_resumen_tesoreria(db: Session, empresa_id: int):
    tasa_obj = db.query(TasaCambio).filter(TasaCambio.empresa_id == empresa_id).first()
    tasa_bcv = tasa_obj.valor_bcv if tasa_obj else Decimal("0")
    tasa_eur = (tasa_obj.valor_eur or Decimal("0")) if tasa_obj else Decimal("0")
    cuentas = db.query(CuentaTesoreria).filter(CuentaTesoreria.empresa_id == empresa_id, CuentaTesoreria.status == "activa").all()
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
    return total_usd, total_eur, tasa_bcv, tasa_eur


def _calcular_resumen_cartera(db: Session, empresa_id: int):
    hoy = datetime.date.today()
    cxc_abiertas = db.query(CuentaPorCobrar).filter(CuentaPorCobrar.empresa_id == empresa_id, CuentaPorCobrar.status != "pagada").all()
    total_cxc = sum((c.monto_total - c.monto_abonado for c in cxc_abiertas), Decimal("0"))
    cxc_vencidas = [c for c in cxc_abiertas if c.fecha_vencimiento < hoy]
    total_cxc_vencido = sum((c.monto_total - c.monto_abonado for c in cxc_vencidas), Decimal("0"))
    cxp_abiertas = db.query(CuentaPorPagar).filter(CuentaPorPagar.empresa_id == empresa_id, CuentaPorPagar.status != "pagada").all()
    total_cxp = sum((c.monto_total - c.monto_abonado for c in cxp_abiertas), Decimal("0"))
    return total_cxc, total_cxc_vencido, len(cxc_vencidas), total_cxp


def _calcular_inteligencia_crm(db: Session, empresa_id: int):
    hoy = datetime.date.today()
    hace_90 = hoy - datetime.timedelta(days=90)
    clientes = db.query(Cliente).filter(Cliente.empresa_id == empresa_id).all()
    filas_90d = (
        db.query(Ticket.cliente_id, func.count(Ticket.id).label("frecuencia"), func.sum(Ticket.monto_usd).label("monto"))
        .filter(Ticket.empresa_id == empresa_id, Ticket.status == "procesado", func.date(Ticket.created_at) >= hace_90)
        .group_by(Ticket.cliente_id).all()
    )
    stats_90d = {f.cliente_id: f for f in filas_90d}
    filas_ultima = db.query(Ticket.cliente_id, func.max(Ticket.created_at).label("ultima")).filter(Ticket.empresa_id == empresa_id, Ticket.status == "procesado").group_by(Ticket.cliente_id).all()
    ultima_compra = {f.cliente_id: f.ultima for f in filas_ultima}
    filas_cxc = db.query(CuentaPorCobrar.cliente_id, func.sum(CuentaPorCobrar.monto_total - CuentaPorCobrar.monto_abonado).label("saldo"), func.min(CuentaPorCobrar.fecha_vencimiento).label("vencimiento_mas_antiguo")).filter(CuentaPorCobrar.empresa_id == empresa_id, CuentaPorCobrar.status != "pagada").group_by(CuentaPorCobrar.cliente_id).all()
    stats_cxc = {f.cliente_id: f for f in filas_cxc}
    items = []
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
    return items, resumen, monto_riesgo


def _construir_contexto_alo(db: Session, empresa_id: int, cliente: Cliente, item_faltante: Optional[str] = None, pregunta: Optional[str] = None) -> dict:
    tickets = db.query(Ticket, Producto.nombre).join(Producto, Producto.id == Ticket.producto_id).filter(Ticket.cliente_id == cliente.id, Ticket.empresa_id == empresa_id, Ticket.status == "procesado").order_by(Ticket.created_at.desc()).limit(5).all()
    historial = [{"nombre": nombre, "monto_usd": float(t.monto_usd), "fecha": str(t.created_at)} for t, nombre in tickets]
    cxc_abiertas = db.query(CuentaPorCobrar).filter(CuentaPorCobrar.cliente_id == cliente.id, CuentaPorCobrar.empresa_id == empresa_id, CuentaPorCobrar.status != "pagada").all()
    saldo_cxc = sum((c.monto_total - c.monto_abonado for c in cxc_abiertas), Decimal("0"))
    visitas = db.query(VisitaCliente).filter(VisitaCliente.cliente_id == cliente.id, VisitaCliente.empresa_id == empresa_id).order_by(VisitaCliente.fecha_visita.desc()).limit(3).all()
    visitas_recientes = [{"fecha_visita": str(v.fecha_visita), "comentarios": v.comentarios, "encuesta": {"inventario_cliente": v.encuesta.inventario_cliente, "rotacion_productos": v.encuesta.rotacion_productos} if v.encuesta else None} for v in visitas]
    ordenes = db.query(OrdenVenta).filter(OrdenVenta.cliente_id == cliente.id, OrdenVenta.empresa_id == empresa_id).order_by(OrdenVenta.created_at.desc()).limit(3).all()
    ordenes_recientes = [{"tipo": o.tipo, "total_usd": float(o.total_usd), "estatus": o.estatus, "fecha": str(o.created_at)} for o in ordenes]
    return {
        "cliente_nombre": cliente.nombre, "cliente_telefono": cliente.telefono, "historial_compras": historial,
        "item_faltante": item_faltante, "saldo_cxc_actual": float(saldo_cxc), "visitas_recientes": visitas_recientes,
        "ordenes_recientes": ordenes_recientes, "pregunta_usuario": pregunta,
    }


def _buscar_candidatos_producto(db: Session, empresa_id: int, producto_id: int) -> dict[int, dict]:
    producto = db.query(Producto).filter(Producto.id == producto_id, Producto.empresa_id == empresa_id).first()
    if not producto:
        return {}
    candidatos = {}
    compradores = db.query(Ticket.cliente_id).filter(Ticket.empresa_id == empresa_id, Ticket.producto_id == producto_id, Ticket.status == "procesado").distinct().all()
    for (cliente_id,) in compradores:
        candidatos.setdefault(cliente_id, {"compro_antes": False, "sin_quejas_rubro": False})
        candidatos[cliente_id]["compro_antes"] = True
    if producto.linea:
        filas = db.query(EncuestaInventarioItem.cliente_id, EncuestaInventarioItem.tiene_queja).join(Producto, Producto.id == EncuestaInventarioItem.producto_id).filter(Producto.empresa_id == empresa_id, Producto.linea == producto.linea).all()
        tuvo_queja_por_cliente = {}
        for cliente_id, tiene_queja in filas:
            tuvo_queja_por_cliente[cliente_id] = tuvo_queja_por_cliente.get(cliente_id, False) or bool(tiene_queja)
        for cliente_id, tuvo_queja in tuvo_queja_por_cliente.items():
            if not tuvo_queja:
                candidatos.setdefault(cliente_id, {"compro_antes": False, "sin_quejas_rubro": False})
                candidatos[cliente_id]["sin_quejas_rubro"] = True
    return candidatos


# Fallbacks
def _fallback_vale(contexto: dict) -> str:
    ventas_mes = contexto.get("ventas_mes_actual_usd", 0)
    ventas_mes_ant = contexto.get("ventas_mes_anterior_usd", 0)
    variacion = contexto.get("variacion_pct")
    top = contexto.get("top_productos") or []
    stock_critico = contexto.get("productos_stock_critico", 0)
    mermas = contexto.get("mermas_mes_usd_equivalente", 0)
    lineas = [f"📊 Ventas del mes: ${ventas_mes} (mes anterior: ${ventas_mes_ant})."]
    if variacion is not None:
        tendencia = "subieron" if variacion >= 0 else "bajaron"
        lineas.append(f"Las ventas {tendencia} un {abs(variacion):.1f}% respecto al mes pasado.")
    if top:
        lineas.append(f"Tu producto más vendido en los últimos 30 días es '{top[0].get('nombre')}'.")
    if stock_critico:
        lineas.append(f"⚠️ Tienes {stock_critico} producto(s) con stock crítico (≤10 unidades). Revisa reposición pronto.")
    if float(mermas) > 0:
        lineas.append(f"Las mermas de este mes equivalen a ${mermas}.")
    lineas.append("💡 Configura ANTHROPIC_API_KEY en el backend para que VALE te dé un análisis más profundo con IA.")
    return " ".join(lineas)


def _fallback_yhorge(contexto: dict) -> str:
    total_cxc = contexto.get("total_por_cobrar", 0)
    total_cxc_venc = contexto.get("total_por_cobrar_vencido", 0)
    cxc_venc_count = contexto.get("cuentas_por_cobrar_vencidas", 0)
    total_cxp = contexto.get("total_por_pagar", 0)
    saldo_tesoreria = contexto.get("saldo_total_usd_equivalente", 0)
    vencidas_detalle = contexto.get("cxc_vencidas_detalle") or []
    lineas = [f"💰 Tienes ${total_cxc} por cobrar en total, de los cuales ${total_cxc_venc} están vencidos ({cxc_venc_count} cuenta(s))."]
    lineas.append(f"Debes ${total_cxp} a proveedores. Tu saldo consolidado en tesorería es de ${saldo_tesoreria}.")
    if float(saldo_tesoreria) < float(total_cxp):
        lineas.append("⚠️ Tu saldo actual no cubre tus cuentas por pagar pendientes.")
    if vencidas_detalle:
        primero = vencidas_detalle[0]
        lineas.append(f"Prioriza cobrarle a {primero.get('cliente_nombre')}: debe ${primero.get('saldo')}, vencido hace {primero.get('dias_vencido')} día(s).")
    lineas.append("💡 Configura ANTHROPIC_API_KEY en el backend para que YHORGE te redacte mensajes de cobranza personalizados.")
    return " ".join(lineas)


def _fallback_alo(contexto: dict) -> str:
    nombre = contexto.get("cliente_nombre") or "cliente"
    compras = contexto.get("historial_compras") or []
    item_faltante = contexto.get("item_faltante")
    saldo_cxc = contexto.get("saldo_cxc_actual")
    visitas = contexto.get("visitas_recientes") or []
    pregunta = (contexto.get("pregunta_usuario") or "").strip()
    if pregunta:
        lineas = [f"Sobre {nombre}:"]
        if saldo_cxc is not None and float(saldo_cxc) > 0:
            lineas.append(f"debe ${saldo_cxc} en cartera.")
        elif saldo_cxc is not None:
            lineas.append("no tiene saldo pendiente en cartera.")
        if compras:
            lineas.append(f"Su última compra fue '{compras[0].get('nombre')}' (${compras[0].get('monto_usd')}).")
        if visitas:
            lineas.append(f"Última visita registrada: {visitas[0].get('fecha_visita', '')[:10]}.")
        if len(lineas) == 1:
            lineas.append("No hay suficiente información registrada para responder con detalle.")
        lineas.append("💡 Configura ANTHROPIC_API_KEY para que ALO responda preguntas libres con más matiz.")
        return " ".join(lineas)
    if item_faltante:
        return f"Hola {nombre} 👋 vimos que buscabas '{item_faltante}'. Te avisamos en cuanto lo tengamos disponible. ¡Gracias por tu paciencia!"
    if saldo_cxc is not None and float(saldo_cxc) > 0:
        return f"Hola {nombre} 👋 te recordamos que tienes un saldo pendiente de ${saldo_cxc} con nosotros. ¿Coordinamos el pago esta semana?"
    if compras:
        ultimo = compras[0].get("nombre", "tu producto favorito")
        return f"Hola {nombre} 👋 ¡qué alegría saludarte! Notamos que sueles comprar {ultimo}. Tenemos buen stock fresco esta semana, ¿te separamos uno?"
    return f"Hola {nombre} 👋 ¡bienvenido/a! Cuéntanos qué buscas y te ayudamos a encontrarlo."


def _fallback_alo_campana(nombre: str, segmento: str, saldo_cxc: float) -> str:
    if saldo_cxc > 0:
        return f"Hola {nombre} 👋 te recordamos que tienes un saldo pendiente de ${saldo_cxc:.2f} con nosotros. ¿Coordinamos el pago esta semana?"
    if segmento in ("En Riesgo", "Inactivo"):
        return f"Hola {nombre} 👋 te extrañamos por la tienda. Tenemos novedades y buen stock fresco esta semana, ¡pásate a vernos!"
    if segmento == "VIP":
        return f"Hola {nombre} 👋 gracias por ser un cliente frecuente. Queremos consentirte con una atención especial en tu próxima visita, ¡te esperamos!"
    if segmento == "Nuevo":
        return f"Hola {nombre} 👋 ¡bienvenido/a! Esperamos que tu primera experiencia con nosotros haya sido excelente. Cualquier cosa que necesites, aquí estamos."
    return f"Hola {nombre} 👋 ¡gracias por ser parte de nuestra clientela! Cuéntanos en qué te podemos ayudar hoy."


# ─────────────────────────────────────────────────────────────
# Endpoints de Agentes
# ─────────────────────────────────────────────────────────────
@router.post("/api/v1/agentes/vale", tags=["Agentes IA"], response_model=AgenteRespuesta)
def agente_vale(datos: AgenteConsulta, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(requiere_guia_ia("vale"))):
    estadisticas = _calcular_estadisticas(db, usuario_actual.eid)
    contexto = estadisticas.model_dump(mode="json")
    empresa = db.query(Empresa).filter(Empresa.id == usuario_actual.eid).first()
    system_prompt = (empresa.agente_vale_prompt or "").strip() or VALE_SYSTEM_PROMPT if empresa else VALE_SYSTEM_PROMPT
    model = (empresa.agente_vale_modelo or "").strip() or None if empresa else None
    temp = empresa.agente_vale_temperatura if empresa else None
    resultado = consultar_agente(system_prompt, contexto, datos.pregunta, model=model, temperature=temp)
    if resultado["fuente"] == "ia" and resultado["respuesta"]:
        return AgenteRespuesta(agente="VALE", respuesta=resultado["respuesta"], fuente="ia")
    return AgenteRespuesta(agente="VALE", respuesta=_fallback_vale(contexto), fuente="reglas")


@router.post("/api/v1/agentes/yhorge", tags=["Agentes IA"], response_model=AgenteRespuesta)
def agente_yhorge(datos: AgenteConsulta, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(requiere_guia_ia("yhorge"))):
    empresa_id = usuario_actual.eid
    hoy = datetime.date.today()
    total_cxc, total_cxc_vencido, cxc_vencidas_count, total_cxp = _calcular_resumen_cartera(db, empresa_id)
    saldo_total_usd_eq, saldo_total_eur_eq, tasa_bcv, tasa_eur = _calcular_resumen_tesoreria(db, empresa_id)
    filas_vencidas = (
        db.query(CuentaPorCobrar, Cliente.nombre, Cliente.telefono).join(Cliente, Cliente.id == CuentaPorCobrar.cliente_id)
        .filter(CuentaPorCobrar.empresa_id == empresa_id, CuentaPorCobrar.status != "pagada", CuentaPorCobrar.fecha_vencimiento < hoy)
        .order_by((CuentaPorCobrar.monto_total - CuentaPorCobrar.monto_abonado).desc()).limit(5).all()
    )
    vencidas_detalle = [
        {"cliente_nombre": nombre, "telefono": telefono, "saldo": float(c.monto_total - c.monto_abonado), "dias_vencido": (hoy - c.fecha_vencimiento).days}
        for c, nombre, telefono in filas_vencidas
    ]
    contexto = {
        "total_por_cobrar": float(total_cxc), "total_por_cobrar_vencido": float(total_cxc_vencido),
        "cuentas_por_cobrar_vencidas": cxc_vencidas_count, "total_por_pagar": float(total_cxp),
        "saldo_total_usd_equivalente": float(saldo_total_usd_eq), "saldo_total_eur_equivalente": float(saldo_total_eur_eq),
        "tasa_bcv": float(tasa_bcv), "tasa_eur": float(tasa_eur), "cxc_vencidas_detalle": vencidas_detalle,
    }
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    system_prompt = (empresa.agente_yhorge_prompt or "").strip() or YHORGE_SYSTEM_PROMPT if empresa else YHORGE_SYSTEM_PROMPT
    model = (empresa.agente_yhorge_modelo or "").strip() or None if empresa else None
    temp = empresa.agente_yhorge_temperatura if empresa else None
    resultado = consultar_agente(system_prompt, contexto, datos.pregunta, model=model, temperature=temp)
    if resultado["fuente"] == "ia" and resultado["respuesta"]:
        return AgenteRespuesta(agente="YHORGE", respuesta=resultado["respuesta"], fuente="ia")
    return AgenteRespuesta(agente="YHORGE", respuesta=_fallback_yhorge(contexto), fuente="reglas")


@router.post("/api/v1/agentes/alo", tags=["Agentes IA"], response_model=AgenteRespuesta)
def agente_alo(datos: AloConsulta, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(requiere_guia_ia("alo", ROLES_OPERACION))):
    empresa_id = usuario_actual.eid
    cliente = db.query(Cliente).filter(Cliente.id == datos.cliente_id, Cliente.empresa_id == empresa_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado.")
    contexto = _construir_contexto_alo(db, empresa_id, cliente, item_faltante=datos.contexto, pregunta=datos.pregunta)
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    system_prompt = (empresa.agente_alo_prompt or "").strip() or ALO_SYSTEM_PROMPT if empresa else ALO_SYSTEM_PROMPT
    model = (empresa.agente_alo_modelo or "").strip() or None if empresa else None
    temp = empresa.agente_alo_temperatura if empresa else None
    resultado = consultar_agente(system_prompt, contexto, datos.pregunta, model=model, temperature=temp)
    if resultado["fuente"] == "ia" and resultado["respuesta"]:
        return AgenteRespuesta(agente="ALO", respuesta=resultado["respuesta"], fuente="ia")
    return AgenteRespuesta(agente="ALO", respuesta=_fallback_alo(contexto), fuente="reglas")


@router.post("/api/v1/agentes/alo/campana", tags=["Agentes IA"], response_model=CampanaAloResponse)
def campana_alo(datos: CampanaAloRequest, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(requiere_guia_ia("alo", ROLES_OPERACION))):
    empresa_id = usuario_actual.eid
    if datos.segmento not in SEGMENTOS_CRM:
        raise HTTPException(status_code=400, detail=f"Segmento inválido. Use uno de: {', '.join(SEGMENTOS_CRM)}.")
    clientes_crm, _, _ = _calcular_inteligencia_crm(db, empresa_id)
    objetivo = [c for c in clientes_crm if c.segmento == datos.segmento]
    limite = max(1, min(datos.limite, 20))
    seleccionados = objetivo[:limite]
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    system_prompt = (empresa.agente_alo_prompt or "").strip() or ALO_SYSTEM_PROMPT if empresa else ALO_SYSTEM_PROMPT
    model = (empresa.agente_alo_modelo or "").strip() or None if empresa else None
    temp = empresa.agente_alo_temperatura if empresa else None
    generados = []
    hubo_ia = False
    for item in seleccionados:
        cliente = db.query(Cliente).filter(Cliente.id == item.cliente_id, Cliente.empresa_id == empresa_id).first()
        if not cliente:
            continue
        pregunta = f"Redacta un mensaje corto de WhatsApp para este cliente. Motivo interno (no lo menciones tal cual): {item.recomendacion}."
        contexto = _construir_contexto_alo(db, empresa_id, cliente, pregunta=pregunta)
        resultado = consultar_agente(system_prompt, contexto, pregunta, model=model, temperature=temp)
        if resultado["fuente"] == "ia" and resultado["respuesta"]:
            mensaje = resultado["respuesta"]
            hubo_ia = True
        else:
            mensaje = _fallback_alo_campana(cliente.nombre, item.segmento, float(item.saldo_cxc))
        generados.append(CampanaAloItem(cliente_id=cliente.id, nombre=cliente.nombre, telefono=cliente.telefono, instagram=cliente.instagram, mensaje=mensaje))
    return CampanaAloResponse(segmento=datos.segmento, fuente="ia" if hubo_ia else "reglas", total_segmento=len(objetivo), generados=generados)


@router.post("/api/v1/agentes/alo/campana-producto", tags=["Agentes IA"], response_model=CampanaProductoResponse)
def campana_alo_producto(datos: CampanaProductoRequest, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(requiere_guia_ia("alo", ROLES_OPERACION))):
    empresa_id = usuario_actual.eid
    if not datos.productos:
        raise HTTPException(status_code=400, detail="Debes indicar al menos un producto con su oferta.")
    ofertas_por_cliente = {}
    for item in datos.productos:
        producto = db.query(Producto).filter(Producto.id == item.producto_id, Producto.empresa_id == empresa_id).first()
        if not producto:
            continue
        candidatos = _buscar_candidatos_producto(db, empresa_id, item.producto_id)
        for cliente_id, senales in candidatos.items():
            ofertas_por_cliente.setdefault(cliente_id, []).append({
                "producto_nombre": producto.nombre, "oferta": item.oferta,
                "compro_antes": senales["compro_antes"], "sin_quejas_rubro": senales["sin_quejas_rubro"],
            })
    limite = max(1, min(datos.limite, 50))
    cliente_ids = list(ofertas_por_cliente.keys())[:limite]
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    system_prompt = (empresa.agente_alo_prompt or "").strip() or ALO_SYSTEM_PROMPT if empresa else ALO_SYSTEM_PROMPT
    model = (empresa.agente_alo_modelo or "").strip() or None if empresa else None
    temp = empresa.agente_alo_temperatura if empresa else None
    generados = []
    hubo_ia = False
    for cliente_id in cliente_ids:
        cliente = db.query(Cliente).filter(Cliente.id == cliente_id, Cliente.empresa_id == empresa_id).first()
        if not cliente:
            continue
        ofertas_cliente = ofertas_por_cliente[cliente_id]
        lista_ofertas_texto = "; ".join(f"{o['producto_nombre']}: {o['oferta']}" for o in ofertas_cliente)
        pregunta = f"Redacta UN solo mensaje corto de WhatsApp que combine estas ofertas en un único párrafo: {lista_ofertas_texto}."
        contexto = _construir_contexto_alo(db, empresa_id, cliente, pregunta=pregunta)
        contexto["ofertas_producto"] = ofertas_cliente
        resultado = consultar_agente(system_prompt, contexto, pregunta, model=model, temperature=temp)
        if resultado["fuente"] == "ia" and resultado["respuesta"]:
            mensaje = resultado["respuesta"]
            hubo_ia = True
        else:
            nombres = ", ".join(o["producto_nombre"] for o in ofertas_cliente)
            mensaje = f"Hola {cliente.nombre} 👋 tenemos una oferta especial para ti en {nombres}. ¡Aprovecha antes de que se agote!"
        generados.append(CandidatoProductoItem(
            cliente_id=cliente.id, nombre=cliente.nombre, telefono=cliente.telefono, instagram=cliente.instagram,
            productos_ofertados=[o["producto_nombre"] for o in ofertas_cliente],
            compro_antes=any(o["compro_antes"] for o in ofertas_cliente),
            sin_quejas_rubro=any(o["sin_quejas_rubro"] for o in ofertas_cliente),
            mensaje=mensaje,
        ))
    return CampanaProductoResponse(fuente="ia" if hubo_ia else "reglas", total_candidatos=len(ofertas_por_cliente), generados=generados)
