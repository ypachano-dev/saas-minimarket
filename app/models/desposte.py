import datetime
from decimal import Decimal
from sqlalchemy import Numeric, Text, String, ForeignKey, DateTime, func
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

class DesposteSolicitud(Base):
    """Cabecera del flujo Caja -> Balanza -> Verificación. Caja solicita (sin tocar stock),
    Balanza ejecuta (aquí se crea el Desposte real, que sí mueve stock), Caja verifica/archiva."""
    __tablename__ = "desposte_solicitud"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False)
    producto_origen_id: Mapped[int] = mapped_column(ForeignKey("producto.id", ondelete="CASCADE"), nullable=False)

    cantidad_estimada: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    comentario_solicitud: Mapped[str | None] = mapped_column(Text, nullable=True)
    solicitado_por_id: Mapped[int | None] = mapped_column(ForeignKey("usuario.id", ondelete="SET NULL"), nullable=True)
    departamento: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # pendiente -> completado -> verificado ; o pendiente -> cancelado
    estatus: Mapped[str] = mapped_column(String(20), default="pendiente")

    desposte_id: Mapped[int | None] = mapped_column(ForeignKey("desposte.id", ondelete="SET NULL"), nullable=True)
    ejecutado_por_id: Mapped[int | None] = mapped_column(ForeignKey("usuario.id", ondelete="SET NULL"), nullable=True)
    ejecutado_en: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)

    verificado_por_id: Mapped[int | None] = mapped_column(ForeignKey("usuario.id", ondelete="SET NULL"), nullable=True)
    verificado_en: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)
    comentario_verificacion: Mapped[str | None] = mapped_column(Text, nullable=True)

    cancelado_motivo: Mapped[str | None] = mapped_column(Text, nullable=True)
    cancelado_por_id: Mapped[int | None] = mapped_column(ForeignKey("usuario.id", ondelete="SET NULL"), nullable=True)

    # Huella de auditoría: quién fue la última persona en editar cantidad/comentario/depto
    # mientras la solicitud seguía "pendiente" (puede ser distinta de quien la creó).
    editado_por_id: Mapped[int | None] = mapped_column(ForeignKey("usuario.id", ondelete="SET NULL"), nullable=True)
    editado_en: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())
