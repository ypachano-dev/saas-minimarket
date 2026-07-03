import datetime
from decimal import Decimal
from sqlalchemy import String, Text, Boolean, Date, Numeric, ForeignKey, DateTime, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

class Producto(Base):
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # Llave maestra Multi-Tenant (Aislamiento lógico obligatorio)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False)
    
    # Identificadores y Clasificación
    codigo_interno: Mapped[str] = mapped_column(String(50), nullable=False) # Ej. P001, CAR-01
    codigo_barras: Mapped[str | None] = mapped_column(String(50), nullable=True) # Código de barras comercial
    nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    caracteristicas: Mapped[str | None] = mapped_column(Text, nullable=True) # Descripción o componentes
    marca: Mapped[str | None] = mapped_column(String(100), nullable=True) # Ej. Over, Nutrimax, Pepsi
    proveedor: Mapped[str | None] = mapped_column(String(150), nullable=True) # Proveedor
    numero_lote: Mapped[str | None] = mapped_column(String(50), nullable=True) # Lote del producto
    linea: Mapped[str | None] = mapped_column(String(100), nullable=True) # Línea crítica de negocio
    clase_o_tipo: Mapped[str | None] = mapped_column(String(100), nullable=True) # Subclasificación operativa
    
    # Logística y Almacén
    tipo_envase: Mapped[str | None] = mapped_column(String(50), nullable=True) # Saco 20kg, Bandeja, Botella, Blíster
    ubicacion: Mapped[str | None] = mapped_column(String(100), nullable=True) # Pasillo 2, Cava Carnes, Anaquel A
    refrigerado: Mapped[bool] = mapped_column(Boolean, default=False) # Control de cadena de frío
    temperatura_conservacion: Mapped[str | None] = mapped_column(String(50), default="ambiente") # ambiente, refrigerado, congelado
    perecedero: Mapped[bool] = mapped_column(Boolean, default=False) # Si tiene fecha de caducidad
    foto_url: Mapped[str | None] = mapped_column(Text, nullable=True) # URL o Base64 de la imagen del producto

    # "unidad" (se vende por pieza) o "peso" (se vende por kg, ej. carnicería/verdulería).
    # Solo los productos "peso" pueden ser origen o destino de un desposte.
    tipo_venta: Mapped[str] = mapped_column(String(20), default="unidad")
    # % de merma esperado al desposte/desposte (solo aplica si tipo_venta == "peso")
    factor_merma: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    # Peso de referencia unitario (ej. peso promedio de la pieza completa), informativo
    peso: Mapped[Decimal | None] = mapped_column(Numeric(12, 3), nullable=True)
    
    # Fechas Críticas (Para el motor de alertas)
    fecha_elaboracion: Mapped[datetime.date | None] = mapped_column(Date, nullable=True)
    fecha_vencimiento: Mapped[datetime.date | None] = mapped_column(Date, nullable=True) # Base para alertas automáticas
    fecha_ingreso_stock: Mapped[datetime.date | None] = mapped_column(Date, nullable=True) # Cuándo entró físicamente
    
    # Inventario y Alertas
    # Usamos Numeric(12, 3) para soportar 3 decimales exactos en pesaje de balanzas (Ej. 1.455 kg de carne)
    stock_minimo: Mapped[Decimal] = mapped_column(Numeric(12, 3), default=Decimal("0.000"))
    
    # Estructura Financiera (4 decimales para costos unitarios exactos en compras de volumen)
    costo_usd: Mapped[Decimal] = mapped_column(Numeric(12, 4), default=Decimal("0.0000"))
    precio_1_detalle: Mapped[Decimal] = mapped_column(Numeric(12, 4), default=Decimal("0.0000"))   # P1: Detal
    precio_2_mayorista: Mapped[Decimal] = mapped_column(Numeric(12, 4), default=Decimal("0.0000")) # P2: Mayor
    precio_3_especial: Mapped[Decimal] = mapped_column(Numeric(12, 4), default=Decimal("0.0000"))   # P3: VIP / Volumen
    aplica_iva: Mapped[bool] = mapped_column(Boolean, default=True)
    
    # Auditoría
    status: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())

    # Restricciones compuestas: El código puede repetirse entre empresas del SaaS, 
    # pero es único dentro de un mismo minimarket.
    __table_args__ = (
        UniqueConstraint("codigo_interno", "empresa_id", name="uq_codigo_interno_empresa"),
        UniqueConstraint("codigo_barras", "empresa_id", name="uq_codigo_barras_empresa"),
    )