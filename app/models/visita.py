import datetime
from decimal import Decimal
from sqlalchemy import String, Integer, Numeric, Boolean, ForeignKey, DateTime, Float, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base

class VisitaCliente(Base):
    __tablename__ = "visita_cliente"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False)
    vendedor_id: Mapped[int] = mapped_column(ForeignKey("usuario.id"), nullable=False)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("cliente.id"), nullable=False)
    
    fecha_visita: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())
    comentarios: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Coordenadas de check-in de la visita
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    
    foto_visita_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())

    # Relación uno-a-uno con la encuesta
    encuesta: Mapped["EncuestaMarketing"] = relationship("EncuestaMarketing", back_populates="visita", cascade="all, delete-orphan", uselist=False)

class EncuestaMarketing(Base):
    __tablename__ = "encuesta_marketing"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    visita_id: Mapped[int] = mapped_column(ForeignKey("visita_cliente.id", ondelete="CASCADE"), nullable=False)
    
    inventario_cliente: Mapped[str | None] = mapped_column(Text, nullable=True)
    rotacion_productos: Mapped[str | None] = mapped_column(Text, nullable=True)
    comentarios_adicionales: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())

    visita: Mapped[VisitaCliente] = relationship("VisitaCliente", back_populates="encuesta")

class EncuestaInventarioItem(Base):
    """Una fila por producto reportado en la encuesta de inventario de una visita.
    Histórico puro: nunca se actualiza ni sobreescribe, solo se inserta. El stock 'actual'
    de un cliente para un producto se deriva siempre tomando la fila con MAX(created_at)
    agrupando por cliente_id+producto_id, jamás de un campo mutable."""
    __tablename__ = "encuesta_inventario_item"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    visita_id: Mapped[int] = mapped_column(ForeignKey("visita_cliente.id", ondelete="CASCADE"), nullable=False)
    # Denormalizado a propósito para no tener que JOIN con visita_cliente en cada consulta
    cliente_id: Mapped[int] = mapped_column(ForeignKey("cliente.id"), nullable=False)
    producto_id: Mapped[int] = mapped_column(ForeignKey("producto.id"), nullable=False)

    stock_observado: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    tiene_queja: Mapped[bool] = mapped_column(Boolean, default=False)
    detalle_queja: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())
