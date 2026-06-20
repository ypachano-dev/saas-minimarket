import datetime
from sqlalchemy import String, ForeignKey, DateTime, Text, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

class Proveedor(Base):
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # Llave maestra Multi-Tenant
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False)
    
    # RIF (Registro de Información Fiscal) único por empresa
    rif: Mapped[str] = mapped_column(String(50), nullable=False)
    nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    
    telefono: Mapped[str | None] = mapped_column(String(30), nullable=True)
    email: Mapped[str | None] = mapped_column(String(100), nullable=True)
    direccion: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())

    # Restricción compuesta: El RIF del proveedor debe ser único dentro de la misma empresa
    __table_args__ = (
        UniqueConstraint("rif", "empresa_id", name="uq_rif_proveedor_empresa"),
    )
