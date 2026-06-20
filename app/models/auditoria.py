import datetime
from decimal import Decimal
from sqlalchemy import String, Numeric, Text, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

class AuditoriaInventario(Base):
    """Cabecera de una auditoría/conteo físico de inventario. Al abrir, toma una foto del
    stock del sistema por producto; al cerrar, ajusta el inventario según lo contado."""
    __tablename__ = "auditoriainventario"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuario.id", ondelete="SET NULL"), nullable=True)

    fecha: Mapped[datetime.date] = mapped_column(default=datetime.date.today)
    status: Mapped[str] = mapped_column(String(20), default="abierta")  # abierta, cerrada
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())

class AuditoriaInventarioItem(Base):
    """Un renglón de producto dentro de una auditoría: cantidad de sistema (al abrir) vs.
    cantidad física (contada), y la diferencia resultante."""
    __tablename__ = "auditoriainventarioitem"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    auditoria_id: Mapped[int] = mapped_column(ForeignKey("auditoriainventario.id", ondelete="CASCADE"), nullable=False)
    producto_id: Mapped[int] = mapped_column(ForeignKey("producto.id", ondelete="CASCADE"), nullable=False)

    cantidad_sistema: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    cantidad_fisica: Mapped[Decimal | None] = mapped_column(Numeric(12, 3), nullable=True)
    diferencia: Mapped[Decimal | None] = mapped_column(Numeric(12, 3), nullable=True)
