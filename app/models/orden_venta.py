import datetime
from decimal import Decimal
from sqlalchemy import String, Integer, ForeignKey, DateTime, Numeric, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base

class OrdenVenta(Base):
    __tablename__ = "orden_venta"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False)
    vendedor_id: Mapped[int] = mapped_column(ForeignKey("usuario.id"), nullable=False)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("cliente.id"), nullable=False)
    
    # tipo: 'presupuesto' o 'pedido'
    tipo: Mapped[str] = mapped_column(String(50), nullable=False)
    
    total_usd: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    estatus: Mapped[str] = mapped_column(String(30), default="pendiente") # pendiente, aprobado, rechazado, procesado
    
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())
    
    items: Mapped[list["OrdenVentaItem"]] = relationship("OrdenVentaItem", back_populates="orden", cascade="all, delete-orphan")

class OrdenVentaItem(Base):
    __tablename__ = "orden_venta_item"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    orden_venta_id: Mapped[int] = mapped_column(ForeignKey("orden_venta.id", ondelete="CASCADE"), nullable=False)
    producto_id: Mapped[int] = mapped_column(ForeignKey("producto.id"), nullable=False)
    
    cantidad: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    precio_unitario: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    monto_usd: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    
    orden: Mapped[OrdenVenta] = relationship("OrdenVenta", back_populates="items")
