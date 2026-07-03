import datetime
from decimal import Decimal
from sqlalchemy import String, Numeric, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

# Catálogo de bancos/medios de pago soportados por la Tesorería de la empresa.
BANCOS_VALIDOS = [
    "BANESCO", "BNC", "PROVINCIAL", "BANCO_DE_VENEZUELA", "BANGENTE",
    "MERCANTIL", "BINANCE", "EFECTIVO_BS", "EFECTIVO_USD", "ZELLE",
]

class CuentaTesoreria(Base):
    __tablename__ = "cuenta_tesoreria"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False)

    banco: Mapped[str] = mapped_column(String(40), nullable=False)
    alias: Mapped[str] = mapped_column(String(100), nullable=False)
    moneda: Mapped[str] = mapped_column(String(10), nullable=False, default="USD")  # USD, VES, USDT
    numero_referencia: Mapped[str | None] = mapped_column(String(60), nullable=True)
    saldo_actual: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(20), default="activa")
    saldo_cargado_por: Mapped[str | None] = mapped_column(String(100), nullable=True)
    saldo_fecha: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())

class MovimientoTesoreria(Base):
    __tablename__ = "movimiento_tesoreria"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False)
    cuenta_id: Mapped[int] = mapped_column(ForeignKey("cuenta_tesoreria.id", ondelete="CASCADE"), nullable=False)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuario.id", ondelete="SET NULL"), nullable=True)

    tipo: Mapped[str] = mapped_column(String(10), nullable=False)  # ingreso, egreso
    monto: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    concepto: Mapped[str] = mapped_column(String(255), nullable=False)

    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())
