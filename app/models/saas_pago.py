import datetime
from sqlalchemy import String, ForeignKey, DateTime, func, Float
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

class SaasPago(Base):
    __tablename__ = "saas_pago"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False)
    monto: Mapped[float] = mapped_column(Float, nullable=False)
    metodo: Mapped[str] = mapped_column(String(50), nullable=False) # Pago Móvil, Zelle, Transferencia, Efectivo
    referencia: Mapped[str] = mapped_column(String(50), nullable=False)
    comprobante: Mapped[str | None] = mapped_column(String(255), nullable=True) # URL del capture
    fecha: Mapped[str] = mapped_column(String(10), nullable=False) # YYYY-MM-DD
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())
