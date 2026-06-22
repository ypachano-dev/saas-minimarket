import datetime
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, Field
from typing import List, Optional

# Este es el molde de lo que el navegador debe enviar para registrar un negocio
class RegistroEmpresaAdmin(BaseModel):
    # Datos del Minimarket / Empresa
    nombre_empresa: str
    rif_or_cedula: str
    telefono: Optional[str] = None
    direccion: Optional[str] = None
    tipo_negocio: Optional[str] = "minimarket"
    
    # Datos del Dueño / Administrador
    nombre_admin: str
    username_admin: str
    email_admin: str
    password_admin: str

# Molde de entrada para el inicio de sesión
class LoginRequest(BaseModel):
    email: str
    password: str

# Molde de salida del Token JWT
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

# Datos extraídos del payload del Token JWT (usuario autenticado)
# Nota: 'eid' es el alias compacto de 'empresa_id' dentro del JWT para reducir el tamaño del token
class TokenData(BaseModel):
    usuario_id: int
    eid: int
    rol: str
    email: Optional[str] = None

# Campos comunes para crear/leer un Cliente (sin empresa_id, inyectado por el backend)
class ClienteBase(BaseModel):
    cedula: str
    nombre: str
    telefono: Optional[str] = None
    email: Optional[str] = None
    instagram: Optional[str] = None
    telegram: Optional[str] = None
    direccion: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    foto_fachada_url: Optional[str] = None
    limite_credito: Decimal = Decimal("0")

# Molde de entrada para registrar un Cliente
class ClienteCreate(ClienteBase):
    pass

# Molde de entrada para editar un Cliente (todos los campos opcionales)
class ClienteUpdate(BaseModel):
    cedula: Optional[str] = None
    nombre: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    instagram: Optional[str] = None
    telegram: Optional[str] = None
    direccion: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    foto_fachada_url: Optional[str] = None
    limite_credito: Optional[Decimal] = None

# Molde de salida con los datos completos del Cliente
class ClienteResponse(ClienteBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    empresa_id: int
    created_at: datetime.datetime

# Campos comunes para crear/leer un Producto (sin empresa_id, inyectado por el backend)
class ProductoBase(BaseModel):
    codigo_interno: str
    codigo_barras: Optional[str] = None
    nombre: str
    caracteristicas: Optional[str] = None
    marca: Optional[str] = None
    linea: Optional[str] = None
    clase_o_tipo: Optional[str] = None
    tipo_envase: Optional[str] = None
    ubicacion: Optional[str] = None
    refrigerado: bool = False
    temperatura_conservacion: Optional[str] = "ambiente"
    perecedero: bool = False
    fecha_elaboracion: Optional[datetime.date] = None
    fecha_vencimiento: Optional[datetime.date] = None
    fecha_ingreso_stock: Optional[datetime.date] = None
    stock_minimo: Decimal = Decimal("0.000")
    costo_usd: Decimal = Decimal("0.0000")
    precio_1_detalle: Decimal = Decimal("0.0000")
    precio_2_mayorista: Decimal = Decimal("0.0000")
    precio_3_especial: Decimal = Decimal("0.0000")
    aplica_iva: bool = True
    tipo_venta: str = "unidad"  # "unidad" o "peso"
    factor_merma: Optional[Decimal] = None
    peso: Optional[Decimal] = None
    foto_url: Optional[str] = None

# Molde de entrada para registrar un Producto
class ProductoCreate(ProductoBase):
    pass

# Molde de entrada para editar un Producto (todos los campos opcionales)
class ProductoUpdate(BaseModel):
    codigo_interno: Optional[str] = None
    codigo_barras: Optional[str] = None
    nombre: Optional[str] = None
    caracteristicas: Optional[str] = None
    marca: Optional[str] = None
    linea: Optional[str] = None
    clase_o_tipo: Optional[str] = None
    tipo_envase: Optional[str] = None
    ubicacion: Optional[str] = None
    refrigerado: Optional[bool] = None
    temperatura_conservacion: Optional[str] = None
    perecedero: Optional[bool] = None
    fecha_elaboracion: Optional[datetime.date] = None
    fecha_vencimiento: Optional[datetime.date] = None
    fecha_ingreso_stock: Optional[datetime.date] = None
    stock_minimo: Optional[Decimal] = None
    costo_usd: Optional[Decimal] = None
    precio_1_detalle: Optional[Decimal] = None
    precio_2_mayorista: Optional[Decimal] = None
    precio_3_especial: Optional[Decimal] = None
    aplica_iva: Optional[bool] = None
    tipo_venta: Optional[str] = None
    factor_merma: Optional[Decimal] = None
    peso: Optional[Decimal] = None
    foto_url: Optional[str] = None
    status: Optional[bool] = None

# Molde de salida con los datos completos del Producto
class ProductoResponse(ProductoBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    empresa_id: int
    status: bool
    created_at: datetime.datetime
    stock_total: float = 0.0

# Molde de entrada para registrar la entrada de un Lote (sin empresa_id, inyectado por el backend)
class LoteCreate(BaseModel):
    producto_id: int
    codigo_lote: str
    cantidad_inicial: Decimal
    fecha_ingreso: Optional[datetime.date] = None  # Si no se envía, se usa la fecha actual
    fecha_vencimiento: datetime.date

# Molde de salida con los datos completos del Lote
class LoteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    empresa_id: int
    producto_id: int
    codigo_lote: str
    cantidad_inicial: Decimal
    cantidad_actual: Decimal
    fecha_ingreso: datetime.date
    fecha_vencimiento: datetime.date
    status: str
    created_at: datetime.datetime

# Molde de entrada para registrar una Merma (sin empresa_id ni usuario_id, inyectados por el backend)
class MermaCreate(BaseModel):
    lote_id: int
    cantidad: Decimal
    motivo: str
    observaciones: Optional[str] = None

# Molde de salida con los datos completos de la Merma
class MermaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    empresa_id: int
    usuario_id: int
    producto_id: int
    lote_id: Optional[int] = None
    cantidad: Decimal
    motivo: str
    observaciones: Optional[str] = None
    created_at: datetime.datetime

# Un producto/línea dentro de la venta (peso o cantidad despachada)
class TicketItemCreate(BaseModel):
    producto_id: int
    peso: Decimal

# Molde de entrada para registrar una venta (sin empresa_id ni usuario_id, inyectados por el backend)
class TicketCreate(BaseModel):
    cliente_id: int
    items: List[TicketItemCreate]

# Molde de salida con los datos completos de un Ticket (una línea de la venta)
# monto_ves se calcula dinámicamente (no se almacena) a partir de la tasa BCV vigente
class TicketResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    empresa_id: int
    usuario_id: int
    producto_id: int
    cliente_id: int
    peso: Decimal
    monto_usd: Decimal
    monto_ves: Decimal
    status: str
    created_at: datetime.datetime
    direccion_entrega: Optional[str] = None
    repartidor_id: Optional[int] = None
    x: float = Field(default=250.0, validation_alias="coord_x")
    y: float = Field(default=180.0, validation_alias="coord_y")
    cliente: Optional[str] = None
    direccion: Optional[str] = None

# Resumen devuelto al cerrar la venta: cada línea generada y los totales en ambas monedas
class VentaResponse(BaseModel):
    tickets: List[TicketResponse]
    total_usd: Decimal
    total_ves: Decimal
    tasa_bcv: Decimal

# Molde de entrada para actualizar la tasa BCV/EUR de la empresa
class TasaCambioUpdate(BaseModel):
    valor_bcv: Decimal
    valor_eur: Optional[Decimal] = None

# Molde de salida con la tasa BCV y EUR vigente de la empresa
class TasaCambioResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    empresa_id: int
    valor_bcv: Decimal
    valor_eur: Optional[Decimal] = None
    fecha_actualizacion: datetime.datetime

# --- Módulo de Analítica y Reportes (Dashboard) ---

class StockBajoItem(BaseModel):
    producto_id: int
    codigo_interno: str
    nombre: str
    stock_total: Decimal

class LoteCriticoItem(BaseModel):
    lote_id: int
    producto_id: int
    producto_nombre: str
    codigo_lote: str
    cantidad_actual: Decimal
    fecha_vencimiento: datetime.date
    dias_restantes: int

class VentasHoyResponse(BaseModel):
    monto_usd: Decimal
    monto_ves: Decimal

class ResumenMermasResponse(BaseModel):
    cantidad_total_mermada: Decimal
    total_registros: int
    motivo_mas_frecuente: Optional[str] = None

class DashboardResponse(BaseModel):
    tasa_bcv: Decimal
    ventas_hoy: VentasHoyResponse
    alertas_stock_bajo: List[StockBajoItem]
    alertas_vencimiento: List[LoteCriticoItem]
    resumen_mermas_mes: ResumenMermasResponse

# --- CRM: Post-Venta y Control de Faltantes ---
class PeticionFaltanteCreate(BaseModel):
    cliente_id: int
    item: str

class PeticionFaltanteResponse(BaseModel):
    id: int
    cliente_id: int
    cliente_nombre: str
    item: str
    status: str
    disponible: bool
    created_at: datetime.datetime

class SeguimientoBotResponse(BaseModel):
    id: int
    ticket_id: int
    cliente_nombre: str
    tipo_mensaje: str
    respuesta_cliente: Optional[str] = None
    status_envio: str
    created_at: datetime.datetime

class SeguimientoBotCreate(BaseModel):
    ticket_id: int
    tipo_mensaje: str
    respuesta_cliente: Optional[str] = None
    status_envio: str = "pendiente"

class SeguimientoBotUpdate(BaseModel):
    status_envio: str
    respuesta_cliente: Optional[str] = None

# --- Nuevos Esquemas para Ingreso de Datos ---

class ProveedorCreate(BaseModel):
    rif: str
    nombre: str
    telefono: Optional[str] = None
    email: Optional[str] = None
    direccion: Optional[str] = None

class ProveedorUpdate(BaseModel):
    rif: Optional[str] = None
    nombre: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    direccion: Optional[str] = None

class ProveedorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    empresa_id: int
    rif: str
    nombre: str
    telefono: Optional[str] = None
    email: Optional[str] = None
    direccion: Optional[str] = None
    created_at: datetime.datetime

class VehiculoCreate(BaseModel):
    placa: str
    marca: str
    modelo: str
    tipo: str # Moto, Carro, Camión
    status: str = "Operativo" # Operativo, Mantenimiento, Inactivo

class VehiculoUpdate(BaseModel):
    placa: Optional[str] = None
    marca: Optional[str] = None
    modelo: Optional[str] = None
    tipo: Optional[str] = None
    status: Optional[str] = None

class VehiculoResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    empresa_id: int
    placa: str
    marca: str
    modelo: str
    tipo: str
    status: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    ubicacion_actualizada_en: Optional[datetime.datetime] = None
    created_at: datetime.datetime

# Molde para que el repartidor reporte su posición GPS en vivo desde el celular
class VehiculoUbicacionUpdate(BaseModel):
    lat: float
    lng: float

class UsuarioCreate(BaseModel):
    nombre: str
    email: str
    password: str
    rol: str
    status: bool = True

class UsuarioUpdate(BaseModel):
    nombre: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    rol: Optional[str] = None
    status: Optional[bool] = None

class UsuarioResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    empresa_id: int
    nombre: str
    email: str
    rol: str
    status: bool
    created_at: datetime.datetime

# --- Esquemas de Pesaje e Integración POS ---

class TicketPesajeCreate(BaseModel):
    cliente_id: int
    producto_id: int
    peso: Decimal

# Molde para corregir el peso de un pesaje ya guardado pero aún pendiente de pago
# (ej. el cliente se devuelve parte del producto o el operador se equivocó al pesar)
class TicketPesoUpdate(BaseModel):
    peso: Decimal

class TicketModification(BaseModel):
    ticket_id: int
    peso: Decimal

class ProcesarPagoTickets(BaseModel):
    ticket_ids: List[int]
    modificaciones: Optional[List[TicketModification]] = None

# --- Esquemas para Delivery Exprés (PedidoDelivery) ---
class PedidoDeliveryCreate(BaseModel):
    cliente_nombre: str
    cliente_telefono: str
    cliente_direccion: Optional[str] = None
    vehiculo_id: Optional[int] = None
    chofer_cedula: str
    origen: str
    origen_lat: float
    origen_lng: float
    destino: str
    destino_lat: float
    destino_lng: float
    distancia_km: Optional[float] = None
    eta_min: Optional[int] = None
    estado: str = "CREADO"
    metodo_pago: str
    monto_total: float
    notas: Optional[str] = None

class PedidoDeliveryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    empresa_id: int
    cliente_nombre: str
    cliente_telefono: str
    cliente_direccion: Optional[str] = None
    vehiculo_id: Optional[int] = None
    chofer_cedula: str
    origen: str
    origen_lat: float
    origen_lng: float
    destino: str
    destino_lat: float
    destino_lng: float
    distancia_km: Optional[float] = None
    eta_min: Optional[int] = None
    estado: str
    metodo_pago: str
    monto_total: float
    notas: Optional[str] = None
    coord_x: float
    coord_y: float
    created_at: datetime.datetime

# Molde para que el repartidor o el despachador avancen el estado del pedido
class PedidoDeliveryEstadoUpdate(BaseModel):
    estado: str

# --- Esquemas para Pedidos y Compras (OrdenCompra) ---
class OrdenCompraItemCreate(BaseModel):
    nombre: str
    cantidad: float
    costo: float

class OrdenCompraItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    producto_nombre: str
    cantidad: float
    costo: float

class OrdenCompraCreate(BaseModel):
    proveedor: str
    items: List[OrdenCompraItemCreate]

class OrdenCompraResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    empresa_id: int
    proveedor: str
    items_count: int
    total_usd: float
    origen: str
    estatus: str
    created_at: datetime.datetime

# --- Esquemas para Bancos y Tesorería ---

class CuentaTesoreriaCreate(BaseModel):
    banco: str
    alias: str
    moneda: str = "USD"
    numero_referencia: Optional[str] = None
    saldo_actual: Decimal = Decimal("0")

class CuentaTesoreriaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    empresa_id: int
    banco: str
    alias: str
    moneda: str
    numero_referencia: Optional[str] = None
    saldo_actual: Decimal
    status: str
    created_at: datetime.datetime

class MovimientoTesoreriaCreate(BaseModel):
    cuenta_id: int
    tipo: str  # ingreso, egreso
    monto: Decimal
    concepto: str

class MovimientoTesoreriaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    empresa_id: int
    cuenta_id: int
    usuario_id: Optional[int] = None
    tipo: str
    monto: Decimal
    concepto: str
    created_at: datetime.datetime

class SaldoPorCuentaItem(BaseModel):
    cuenta_id: int
    banco: str
    alias: str
    moneda: str
    saldo_actual: Decimal
    saldo_usd_equivalente: Decimal

class ResumenTesoreriaResponse(BaseModel):
    saldo_total_usd_equivalente: Decimal
    tasa_bcv: Decimal
    cuentas: List[SaldoPorCuentaItem]

# --- Esquemas para Cartera y Créditos (CxC / CxP) ---

class CuentaPorCobrarCreate(BaseModel):
    cliente_id: int
    monto_total: Decimal
    fecha_emision: Optional[datetime.date] = None
    fecha_vencimiento: datetime.date
    notas: Optional[str] = None

class CuentaPorCobrarResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    empresa_id: int
    cliente_id: int
    cliente_nombre: Optional[str] = None
    monto_total: Decimal
    monto_abonado: Decimal
    saldo: Decimal
    fecha_emision: datetime.date
    fecha_vencimiento: datetime.date
    status: str
    notas: Optional[str] = None
    created_at: datetime.datetime

class CuentaPorPagarCreate(BaseModel):
    proveedor_id: int
    monto_total: Decimal
    fecha_emision: Optional[datetime.date] = None
    fecha_vencimiento: datetime.date
    notas: Optional[str] = None

class CuentaPorPagarResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    empresa_id: int
    proveedor_id: int
    proveedor_nombre: Optional[str] = None
    monto_total: Decimal
    monto_abonado: Decimal
    saldo: Decimal
    fecha_emision: datetime.date
    fecha_vencimiento: datetime.date
    status: str
    notas: Optional[str] = None
    created_at: datetime.datetime

class AbonoCreate(BaseModel):
    monto: Decimal

# --- Gastos Fijos / Renglones (servicios, nómina, alquileres, mantenimiento...) ---

class RenglonGastoCreate(BaseModel):
    nombre: str
    categoria: str = "otro"
    monto_esperado_usd: Decimal = Decimal("0")
    frecuencia: str = "mensual"  # semanal, quincenal, mensual, unico

class RenglonGastoUpdate(BaseModel):
    nombre: Optional[str] = None
    categoria: Optional[str] = None
    monto_esperado_usd: Optional[Decimal] = None
    frecuencia: Optional[str] = None
    activo: Optional[bool] = None

class RenglonGastoResponse(BaseModel):
    id: int
    nombre: str
    categoria: str
    monto_esperado_usd: Decimal
    frecuencia: str
    activo: bool
    periodo_label: str
    monto_pagado_periodo: Decimal
    saldo_pendiente_periodo: Decimal

class PagoRenglonCreate(BaseModel):
    monto_usd: Decimal
    fecha_pago: Optional[datetime.date] = None
    comprobante_url: Optional[str] = None
    observaciones: Optional[str] = None

class PagoRenglonResponse(BaseModel):
    id: int
    renglon_id: int
    renglon_nombre: str
    monto_usd: Decimal
    fecha_pago: datetime.date
    comprobante_url: Optional[str] = None
    observaciones: Optional[str] = None
    registrado_por_nombre: Optional[str] = None
    created_at: datetime.datetime

class ResumenCarteraResponse(BaseModel):
    total_por_cobrar: Decimal
    total_por_cobrar_vencido: Decimal
    cuentas_por_cobrar_vencidas: int
    total_por_pagar: Decimal
    total_por_pagar_vencido: Decimal
    cuentas_por_pagar_vencidas: int

# --- Esquemas para Estadísticas Avanzadas ---

class VentaDiariaItem(BaseModel):
    fecha: datetime.date
    monto_usd: Decimal

class ProductoTopItem(BaseModel):
    producto_id: int
    nombre: str
    cantidad_vendida: Decimal
    monto_usd: Decimal

class VentaPorDepartamentoItem(BaseModel):
    departamento: str
    monto_usd: Decimal

class EstadisticasResumenResponse(BaseModel):
    ventas_ultimos_30_dias: List[VentaDiariaItem]
    top_productos: List[ProductoTopItem]
    ventas_por_departamento: List[VentaPorDepartamentoItem]
    ventas_mes_actual_usd: Decimal
    ventas_mes_anterior_usd: Decimal
    variacion_pct: Optional[float] = None
    mermas_mes_usd_equivalente: Decimal
    productos_stock_critico: int

# --- Esquemas para el Dashboard interactivo con drill-down por rubro y rango de fechas ---

class ClienteTopItem(BaseModel):
    cliente_id: int
    nombre: str
    monto_usd: Decimal
    num_compras: int

class RubroDetalleResponse(BaseModel):
    rubro: str
    desde: datetime.date
    hasta: datetime.date
    monto_total_usd: Decimal
    kilos_total: Decimal
    tickets_total: int
    top_productos_por_monto: List[ProductoTopItem]
    top_productos_por_cantidad: List[ProductoTopItem]
    mejores_clientes: List[ClienteTopItem]

class MetricaDepartamentoItem(BaseModel):
    linea: str
    nombre: str
    kilos_despachados: Decimal
    ventas_usd: Decimal
    merma_kilos: Decimal
    rendimiento: float
    personal_comision: Decimal = Decimal("0")

class DashboardAvanzadoResponse(BaseModel):
    desde: datetime.date
    hasta: datetime.date
    deptos: List[MetricaDepartamentoItem]
    reponer: List[dict] = []
    vencer: List[dict] = []

# --- Esquemas para los Agentes de IA (VALE, YHORGE, ALO) ---

class AgenteConsulta(BaseModel):
    pregunta: Optional[str] = None

class AgenteRespuesta(BaseModel):
    agente: str
    respuesta: str
    fuente: str  # "ia" o "reglas"

class AloConsulta(BaseModel):
    cliente_id: int
    contexto: Optional[str] = None  # ej. el ítem faltante que el cliente pidió
    pregunta: Optional[str] = None  # pregunta libre del vendedor/cajero sobre este cliente

# --- Inteligencia CRM: segmentación RFM y campañas masivas de ALO ---

class SegmentoClienteItem(BaseModel):
    cliente_id: int
    nombre: str
    telefono: Optional[str] = None
    segmento: str  # VIP, Activo, En Riesgo, Inactivo, Nuevo
    dias_ultima_compra: Optional[int] = None
    frecuencia_90d: int
    monto_90d: Decimal
    saldo_cxc: Decimal
    saldo_cxc_vencido: bool
    recomendacion: str

class InteligenciaCRMResponse(BaseModel):
    clientes: List[SegmentoClienteItem]
    resumen_segmentos: dict
    monto_en_riesgo_usd: Decimal

class CampanaAloRequest(BaseModel):
    segmento: str
    limite: int = 15

class CampanaAloItem(BaseModel):
    cliente_id: int
    nombre: str
    telefono: Optional[str] = None
    mensaje: str

class CampanaAloResponse(BaseModel):
    segmento: str
    fuente: str  # "ia" si al menos un mensaje vino de IA, "reglas" si todos cayeron al fallback
    total_segmento: int
    generados: List[CampanaAloItem]

# --- Esquemas para Desposte (descomposición de un producto entero en sus cortes) ---

class DesposteItemCreate(BaseModel):
    producto_id: int
    peso: Decimal

class DesposteCreate(BaseModel):
    producto_origen_id: int
    peso_origen: Decimal
    items_destino: List[DesposteItemCreate]
    merma_peso: Optional[Decimal] = None  # informativo; el backend siempre recalcula la merma real
    observaciones: Optional[str] = None

class DesposteItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    producto_id: int
    lote_id: Optional[int] = None
    peso: Decimal

class DesposteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    empresa_id: int
    producto_origen_id: int
    peso_origen: Decimal
    peso_total_destino: Decimal
    merma_peso: Decimal
    observaciones: Optional[str] = None
    created_at: datetime.datetime
    items: List[DesposteItemResponse] = []

# --- Esquemas para Solicitud de Desposte (flujo Caja -> Balanza -> Verificación) ---

class DesposteSolicitudCreate(BaseModel):
    producto_origen_id: int
    cantidad_estimada: Decimal
    comentario_solicitud: Optional[str] = None
    departamento: Optional[str] = None

class DesposteSolicitudEjecutar(BaseModel):
    peso_origen: Decimal
    items_destino: List[DesposteItemCreate]
    observaciones: Optional[str] = None

class DesposteSolicitudVerificar(BaseModel):
    comentario_verificacion: Optional[str] = None

class DesposteSolicitudCancelar(BaseModel):
    motivo: Optional[str] = None

class DesposteSolicitudResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    empresa_id: int
    producto_origen_id: int
    producto_origen_nombre: Optional[str] = None
    cantidad_estimada: Decimal
    comentario_solicitud: Optional[str] = None
    solicitado_por_id: Optional[int] = None
    solicitado_por_nombre: Optional[str] = None
    departamento: Optional[str] = None
    estatus: str
    desposte_id: Optional[int] = None
    ejecutado_por_id: Optional[int] = None
    ejecutado_por_nombre: Optional[str] = None
    ejecutado_en: Optional[datetime.datetime] = None
    verificado_por_id: Optional[int] = None
    verificado_por_nombre: Optional[str] = None
    verificado_en: Optional[datetime.datetime] = None
    comentario_verificacion: Optional[str] = None
    cancelado_motivo: Optional[str] = None
    created_at: datetime.datetime
    desposte: Optional[DesposteResponse] = None

# --- Esquemas para Recepción de Mercancía (Ingreso / Descarga unificados) ---

class RecepcionMercanciaItemCreate(BaseModel):
    producto_id: int
    cantidad: Decimal
    costo_unitario: Decimal
    codigo_lote: str
    fecha_vencimiento: datetime.date

class RecepcionMercanciaCreate(BaseModel):
    proveedor_id: Optional[int] = None
    orden_compra_id: Optional[int] = None
    notas: Optional[str] = None
    items: List[RecepcionMercanciaItemCreate]

class RecepcionMercanciaItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    producto_id: int
    lote_id: Optional[int] = None
    cantidad: Decimal
    costo_unitario: Decimal

class RecepcionMercanciaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    empresa_id: int
    proveedor_id: Optional[int] = None
    proveedor_nombre: Optional[str] = None
    orden_compra_id: Optional[int] = None
    fecha: datetime.date
    notas: Optional[str] = None
    created_at: datetime.datetime
    items: List[RecepcionMercanciaItemResponse] = []

# --- Esquemas para Auditoría de Inventario ---

class AuditoriaInventarioCreate(BaseModel):
    linea: Optional[str] = None  # si se manda, audita solo esa línea/departamento
    notas: Optional[str] = None

class AuditoriaInventarioItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    producto_id: int
    producto_nombre: Optional[str] = None
    cantidad_sistema: Decimal
    cantidad_fisica: Optional[Decimal] = None
    diferencia: Optional[Decimal] = None

class AuditoriaInventarioResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    empresa_id: int
    fecha: datetime.date
    status: str
    notas: Optional[str] = None
    created_at: datetime.datetime
    items: List[AuditoriaInventarioItemResponse] = []

class ConteoFisicoUpdate(BaseModel):
    cantidad_fisica: Decimal

# --- Esquemas para Stock Actual y Proyectado ---

class StockProyectadoItem(BaseModel):
    producto_id: int
    codigo_interno: str
    nombre: str
    stock_actual: Decimal
    velocidad_diaria: Decimal
    dias_restantes: Optional[float] = None
    fecha_agotamiento_estimada: Optional[datetime.date] = None
    alerta: str  # "critico", "atencion", "ok"
    sugerencia_reorden: Decimal

# --- Esquemas para Fuerza de Ventas (GPS, Visitas, OrdenVenta, Rutas) ---

class UsuarioGpsUpdate(BaseModel):
    lat: float
    lng: float

class VendedorUbicacionResponse(BaseModel):
    id: int
    nombre: str
    email: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    ubicacion_actualizada_en: Optional[datetime.datetime] = None

class EncuestaMarketingBase(BaseModel):
    inventario_cliente: Optional[str] = None
    rotacion_productos: Optional[str] = None
    comentarios_adicionales: Optional[str] = None

class EncuestaMarketingCreate(EncuestaMarketingBase):
    pass

class EncuestaMarketingResponse(EncuestaMarketingBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    visita_id: int
    created_at: datetime.datetime

class VisitaClienteCreate(BaseModel):
    cliente_id: int
    comentarios: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    foto_visita_url: Optional[str] = None
    encuesta: Optional[EncuestaMarketingCreate] = None

class VisitaClienteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    empresa_id: int
    vendedor_id: int
    cliente_id: int
    fecha_visita: datetime.datetime
    comentarios: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    foto_visita_url: Optional[str] = None
    encuesta: Optional[EncuestaMarketingResponse] = None
    created_at: datetime.datetime

# --- Visita Cliente: Encuesta de Inventario estructurada por producto ---

class EncuestaInventarioItemCreate(BaseModel):
    producto_id: int
    stock_observado: Decimal
    tiene_queja: bool = False
    detalle_queja: Optional[str] = None

class EncuestaInventarioCreate(BaseModel):
    cliente_id: int
    items: List[EncuestaInventarioItemCreate]
    lat: Optional[float] = None
    lng: Optional[float] = None

class EncuestaInventarioSaveResponse(BaseModel):
    status: str
    visita_id: int
    items_guardados: int

class StockCeroItem(BaseModel):
    producto_id: int
    codigo: str
    nombre: str
    stock_observado: Decimal
    creado_en: datetime.datetime

class FacturaItemResponse(BaseModel):
    producto_id: int
    codigo: str
    nombre: str
    cantidad: Decimal
    precio_unitario: Decimal
    total_linea: Decimal

class FacturaResponse(BaseModel):
    id: int
    numero: str
    numero_factura_a2: Optional[str] = None
    fecha_emision: datetime.datetime
    total_usd: Decimal
    items: List[FacturaItemResponse]

class RankingProductoItem(BaseModel):
    producto_id: int
    codigo: str
    nombre: str
    total_cantidad: Decimal
    total_monto: Decimal
    num_facturas: int

class ProyeccionReposicionItem(BaseModel):
    producto_id: int
    codigo: str
    nombre: str
    num_compras: int
    cantidad_promedio: Decimal
    intervalo_promedio_dias: Optional[float] = None
    ultima_compra: datetime.datetime
    proxima_compra_esperada: Optional[datetime.date] = None
    stock_observado_actual: Optional[Decimal] = None
    recomendado_reponer_ahora: bool

class PendienteCobroItem(BaseModel):
    id: int
    numero_doc: str
    fecha_vencimiento: datetime.date
    saldo_usd: Decimal
    vencida: bool

class PagoRecienteItem(BaseModel):
    fecha: datetime.datetime
    monto: Decimal
    metodo: str
    estado: str

class HistorialPagoResponse(BaseModel):
    cliente_id: int
    pendientes: List[PendienteCobroItem]
    pagos_recientes: List[PagoRecienteItem]
    requiere_cuestionario_cobranza: bool

class GestionCobranzaCreate(BaseModel):
    cliente_id: int
    tipo: str = "VISITA"
    fecha_programada: Optional[datetime.datetime] = None

class GestionCobranzaSaveResponse(BaseModel):
    status: str
    gestion_id: int

class GestionCobranzaRespuestaUpdate(BaseModel):
    respuesta_cliente: str
    efectiva: bool

class OrdenVentaItemCreate(BaseModel):
    producto_id: int
    cantidad: Decimal
    precio_unitario: Decimal

class OrdenVentaItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    producto_id: int
    producto_nombre: Optional[str] = None
    cantidad: Decimal
    precio_unitario: Decimal
    monto_usd: Decimal

class OrdenVentaCreate(BaseModel):
    cliente_id: int
    tipo: str  # presupuesto, pedido
    notas: Optional[str] = None
    items: List[OrdenVentaItemCreate]

class OrdenVentaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    empresa_id: int
    vendedor_id: int
    cliente_id: int
    cliente_nombre: Optional[str] = None
    tipo: str
    total_usd: Decimal
    estatus: str
    notas: Optional[str] = None
    created_at: datetime.datetime
    items: List[OrdenVentaItemResponse]

class RutaActividadCreate(BaseModel):
    cliente_id: Optional[int] = None
    fecha_planificada: datetime.date
    actividad_planificada: str

class RutaActividadResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    ruta_id: int
    cliente_id: Optional[int] = None
    cliente_nombre: Optional[str] = None
    fecha_planificada: datetime.date
    actividad_planificada: str
    ejecutada: bool
    comentarios_avance: Optional[str] = None
    foto_soporte_url: Optional[str] = None
    factura_soporte_monto: Optional[Decimal] = None
    created_at: datetime.datetime
    actualizado_en: Optional[datetime.datetime] = None

class RutaVendedorCreate(BaseModel):
    nombre_ruta: str
    fecha_inicio: datetime.date
    fecha_fin: datetime.date
    monto_viaticos_solicitado: Decimal = Decimal("0.00")
    detalles_viaticos: Optional[str] = None
    actividades: List[RutaActividadCreate]

class RutaVendedorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    empresa_id: int
    vendedor_id: int
    vendedor_nombre: Optional[str] = None
    nombre_ruta: str
    fecha_inicio: datetime.date
    fecha_fin: datetime.date
    estatus: str
    monto_viaticos_solicitado: Decimal
    monto_viaticos_aprobado: Decimal
    detalles_viaticos: Optional[str] = None
    comentarios_gerente: Optional[str] = None
    created_at: datetime.datetime
    actividades: List[RutaActividadResponse]

class RutaEstadoUpdate(BaseModel):
    estatus: str
    monto_viaticos_aprobado: Optional[Decimal] = None
    comentarios_gerente: Optional[str] = None

class ActividadAvanceUpdate(BaseModel):
    ejecutada: bool
    comentarios_avance: Optional[str] = None
    foto_soporte_url: Optional[str] = None
    factura_soporte_monto: Optional[Decimal] = None

class ActividadRtcItem(BaseModel):
    tipo: str  # visita, orden, avance_ruta
    fecha: datetime.datetime
    vendedor_id: int
    vendedor_nombre: str
    cliente_id: Optional[int] = None
    cliente_nombre: Optional[str] = None
    descripcion: str
    monto_usd: Optional[Decimal] = None
