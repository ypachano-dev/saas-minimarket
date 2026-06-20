import datetime
from decimal import Decimal
from sqlalchemy import String, Numeric, Date, Text, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

class CuentaPorCobrar(Base):
    """CxC: dinero que los clientes le deben a la empresa (ventas a crédito / fiado)."""
    __tablename__ = "cuenta_por_cobrar"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("cliente.id", ondelete="CASCADE"), nullable=False)

    monto_total: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    monto_abonado: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    fecha_emision: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    fecha_vencimiento: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pendiente")  # pendiente, parcial, pagada
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())

class CuentaPorPagar(Base):
    """CxP: dinero que la empresa le debe a sus proveedores."""
    __tablename__ = "cuenta_por_pagar"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False)
    proveedor_id: Mapped[int] = mapped_column(ForeignKey("proveedor.id", ondelete="CASCADE"), nullable=False)

    monto_total: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    monto_abonado: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    fecha_emision: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    fecha_vencimiento: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pendiente")
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())
