import datetime
from sqlalchemy import String, Text, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

class Empresa(Base):
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    rif: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    nombre_comercial: Mapped[str] = mapped_column(String(100), nullable=False)
    razon_social: Mapped[str | None] = mapped_column(String(100), nullable=True)
    telefono: Mapped[str | None] = mapped_column(String(20), nullable=True)
    direccion: Mapped[str | None] = mapped_column(Text, nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    
    # Personalización visual de la interfaz por cliente
    color_primario: Mapped[str] = mapped_column(String(7), default="#00ebc7")
    color_secundario: Mapped[str] = mapped_column(String(7), default="#111936")
    
    # Tipo de negocio: 'minimarket' o 'agroferreteria'
    tipo_negocio: Mapped[str] = mapped_column(String(50), default="minimarket")
    
    status: Mapped[str] = mapped_column(String(20), default="activo") # activo, suspendido
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())