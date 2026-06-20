import datetime
from decimal import Decimal
from sqlalchemy import String, Text, Numeric, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

class Merma(Base):
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # Llave maestra Multi-Tenant
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False)
    
    # Quién registra la pérdida (Auditoría: para saber qué empleado reportó la merma)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuario.id"), nullable=False)
    
    # Qué se perdió
    producto_id: Mapped[int] = mapped_column(ForeignKey("producto.id"), nullable=False)
    
    # Opcional: De qué lote específico provino la pérdida (si aplica)
    lote_id: Mapped[int | None] = mapped_column(ForeignKey("lote.id", ondelete="SET NULL"), nullable=True)
    
    # Cuánto se perdió (en unidades o kg)
    cantidad: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    
    # Motivo de la pérdida: vencido, deteriorado, desperdicio_carniceria, robo_hurto
    motivo: Mapped[str] = mapped_column(String(50), nullable=False)
    
    observaciones: Mapped[str | None] = mapped_column(Text, nullable=True) # Detalles extra
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())