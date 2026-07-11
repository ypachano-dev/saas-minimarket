import datetime
from decimal import Decimal
from sqlalchemy import String, Integer, ForeignKey, DateTime, Numeric, Text, func, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base

class Factura(Base):
    __tablename__ = "factura"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuario.id"), nullable=False)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("cliente.id"), nullable=False)
    
    # Nro de Factura (secuencial autogenerado por empresa, uso interno)
    nro_factura: Mapped[str] = mapped_column(String(50), nullable=False)
    # Nro de Control fiscal: SIEMPRE provisto por el usuario (nunca autogenerado),
    # ya que debe corresponder a un formato pre-impreso por una imprenta autorizada
    # o a un comprobante emitido por una impresora/máquina fiscal.
    nro_control: Mapped[str] = mapped_column(String(50), nullable=False)
    # Modalidad de homologación fiscal vigente en la empresa al momento de emitir
    # esta factura (congelada, igual que los datos del cliente): "imprenta" o
    # "maquina_fiscal". Ver app/core/facturacion_config.py.
    modalidad_facturacion: Mapped[str | None] = mapped_column(String(20), nullable=True)
    
    # Datos del cliente al momento de facturar (congelados según exigencia SENIAT)
    cliente_nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    cliente_rif: Mapped[str] = mapped_column(String(20), nullable=False)
    cliente_direccion: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Totales SENIAT
    tasa_bcv: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    monto_exento_usd: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    monto_imponible_usd: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    monto_iva_usd: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    total_usd: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    total_ves: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    
    # Relación con presupuesto de origen (opcional)
    presupuesto_id: Mapped[int | None] = mapped_column(ForeignKey("orden_venta.id"), nullable=True)
    
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())
    
    items: Mapped[list["FacturaItem"]] = relationship("FacturaItem", back_populates="factura", cascade="all, delete-orphan")

class FacturaItem(Base):
    __tablename__ = "factura_item"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    factura_id: Mapped[int] = mapped_column(ForeignKey("factura.id", ondelete="CASCADE"), nullable=False)
    producto_id: Mapped[int] = mapped_column(ForeignKey("producto.id"), nullable=False)
    
    cantidad: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    precio_unitario_usd: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    
    # Indica si aplica IVA (ej: True -> 16%, False -> Exento)
    aplica_iva: Mapped[bool] = mapped_column(Boolean, default=True)
    iva_porcentaje: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("16.00"))
    
    subtotal_usd: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    
    factura: Mapped[Factura] = relationship("Factura", back_populates="items")
