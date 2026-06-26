import datetime
from decimal import Decimal
from sqlalchemy import DateTime, ForeignKey, Numeric, Enum as SAEnum, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base
from app.core.caja_config import EstadoTurno


class TurnoCaja(Base):
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuario.id"), nullable=False)

    estado: Mapped[EstadoTurno] = mapped_column(
        SAEnum(EstadoTurno, values_callable=lambda e: [m.value for m in e], native_enum=False, length=10),
        default=EstadoTurno.ABIERTO,
        nullable=False,
    )

    fecha_apertura: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())
    fecha_cierre: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)

    # Fondo de caja con el que el cajero abre el turno
    monto_inicial_usd: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))
    monto_inicial_ves: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))

    # Calculado por el sistema al cerrar: fondo inicial + ventas 'procesado' del turno
    monto_esperado_usd: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))
    monto_esperado_ves: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))

    # Conteo físico que reporta el cajero al cerrar (nulo mientras el turno está ABIERTO)
    monto_real_usd: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    monto_real_ves: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
