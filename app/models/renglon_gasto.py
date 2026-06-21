import datetime
from decimal import Decimal
from sqlalchemy import String, Numeric, Date, Text, Boolean, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

class RenglonGasto(Base):
    """Categoría de gasto fijo recurrente del negocio (servicios, nómina, alquileres, mantenimiento, etc.),
    configurable libremente por el dueño/gerente. El monto esperado se evalúa por periodo según la frecuencia."""
    __tablename__ = "renglon_gasto"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False)

    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    categoria: Mapped[str] = mapped_column(String(50), default="otro")  # servicios, nomina, alquileres, mantenimiento, otro
    monto_esperado_usd: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    frecuencia: Mapped[str] = mapped_column(String(20), default="mensual")  # semanal, quincenal, mensual, unico
    activo: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())


class PagoRenglon(Base):
    """Un abono o pago real registrado contra un renglón de gasto fijo. Alimenta el historial de pagos."""
    __tablename__ = "pago_renglon"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False)
    renglon_id: Mapped[int] = mapped_column(ForeignKey("renglon_gasto.id", ondelete="CASCADE"), nullable=False)

    monto_usd: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    fecha_pago: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    comprobante_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    observaciones: Mapped[str | None] = mapped_column(Text, nullable=True)
    registrado_por_id: Mapped[int | None] = mapped_column(ForeignKey("usuario.id", ondelete="SET NULL"), nullable=True)

    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())
