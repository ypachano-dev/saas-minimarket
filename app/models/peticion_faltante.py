import datetime
from sqlalchemy import String, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

class PeticionFaltante(Base):
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("cliente.id"), nullable=False)

    item: Mapped[str] = mapped_column(String(150), nullable=False)

    # pendiente, notificado, entregado
    status: Mapped[str] = mapped_column(String(20), default="pendiente")

    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())
