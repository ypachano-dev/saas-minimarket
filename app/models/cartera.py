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

class PagoCxc(Base):
    """Histórico de abonos/pagos aplicados a una CuentaPorCobrar. CuentaPorCobrar.monto_abonado
    sigue siendo el acumulado vigente; esta tabla solo existe para poder mostrar 'pagos recientes'
    del cliente, dato que antes se perdía porque el abono solo incrementaba un campo mutable."""
    __tablename__ = "pago_cxc"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False)
    cxc_id: Mapped[int] = mapped_column(ForeignKey("cuenta_por_cobrar.id", ondelete="CASCADE"), nullable=False)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("cliente.id"), nullable=False)

    monto: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    metodo: Mapped[str] = mapped_column(String(30), default="efectivo")
    estado: Mapped[str] = mapped_column(String(20), default="confirmado")

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
