import datetime
from sqlalchemy import String, Boolean, ForeignKey, DateTime, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

class GestionCobranza(Base):
    """Una gestión de cobranza agendada (ej. durante una visita en campo) y su eventual
    respuesta del cliente. Se crea al detectar que un cliente visitado tiene saldo vencido,
    sin que el vendedor tenga que navegar manualmente al módulo de Cartera."""
    __tablename__ = "gestion_cobranza"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("cliente.id"), nullable=False)
    vendedor_id: Mapped[int] = mapped_column(ForeignKey("usuario.id"), nullable=False)

    tipo: Mapped[str] = mapped_column(String(30), default="VISITA")  # VISITA, LLAMADA, etc.
    fecha_programada: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())

    respuesta_cliente: Mapped[str | None] = mapped_column(Text, nullable=True)
    efectiva: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    fecha_respuesta: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())
