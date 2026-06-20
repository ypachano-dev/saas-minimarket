import datetime
from decimal import Decimal
from sqlalchemy import Numeric, Text, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

class Desposte(Base):
    """Cabecera de una operación de desposte: consume un producto origen (ej. Pollo Entero)
    y produce uno o más cortes resultantes (DesposteItem), registrando la merma real."""
    __tablename__ = "desposte"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuario.id", ondelete="SET NULL"), nullable=True)
    producto_origen_id: Mapped[int] = mapped_column(ForeignKey("producto.id", ondelete="CASCADE"), nullable=False)

    peso_origen: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    peso_total_destino: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    merma_peso: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    observaciones: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())

class DesposteItem(Base):
    """Un corte resultante de una operación de desposte, con el Lote nuevo que se le creó."""
    __tablename__ = "desposte_item"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    desposte_id: Mapped[int] = mapped_column(ForeignKey("desposte.id", ondelete="CASCADE"), nullable=False)
    producto_id: Mapped[int] = mapped_column(ForeignKey("producto.id", ondelete="CASCADE"), nullable=False)
    lote_id: Mapped[int] = mapped_column(ForeignKey("lote.id", ondelete="SET NULL"), nullable=True)

    peso: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
