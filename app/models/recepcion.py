import datetime
from decimal import Decimal
from sqlalchemy import Numeric, Text, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

class RecepcionMercancia(Base):
    """Cabecera de una recepción de mercancía (ingreso/descarga de un proveedor),
    opcionalmente ligada a una Orden de Compra que queda marcada como recibida."""
    __tablename__ = "recepcionmercancia"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False)
    proveedor_id: Mapped[int | None] = mapped_column(ForeignKey("proveedor.id", ondelete="SET NULL"), nullable=True)
    orden_compra_id: Mapped[int | None] = mapped_column(ForeignKey("orden_compra.id", ondelete="SET NULL"), nullable=True)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuario.id", ondelete="SET NULL"), nullable=True)

    fecha: Mapped[datetime.date] = mapped_column(default=datetime.date.today)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())

class RecepcionMercanciaItem(Base):
    """Un renglón recibido: el producto, cantidad y costo, y el Lote nuevo que se creó."""
    __tablename__ = "recepcionmercanciaitem"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    recepcion_id: Mapped[int] = mapped_column(ForeignKey("recepcionmercancia.id", ondelete="CASCADE"), nullable=False)
    producto_id: Mapped[int] = mapped_column(ForeignKey("producto.id", ondelete="CASCADE"), nullable=False)
    lote_id: Mapped[int | None] = mapped_column(ForeignKey("lote.id", ondelete="SET NULL"), nullable=True)

    cantidad: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    costo_unitario: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
