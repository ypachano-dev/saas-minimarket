import datetime
from sqlalchemy import String, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

class SeguimientoBot(Base):
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("ticket.id"), nullable=False)

    tipo_mensaje: Mapped[str] = mapped_column(String(100), nullable=False)
    respuesta_cliente: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # enviado, respondido, fallido
    status_envio: Mapped[str] = mapped_column(String(20), default="enviado")

    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())
