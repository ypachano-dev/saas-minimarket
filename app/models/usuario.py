import datetime
from sqlalchemy import String, ForeignKey, Boolean, DateTime, func, Float
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

class Usuario(Base):
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # Llave maestra Multi-Tenant conectada directamente a la tabla de empresa
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False)
    
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(100), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    
    # Roles operativos para el Minimarket, Retail y Gestión Veterinaria
    rol: Mapped[str] = mapped_column(String(30), nullable=False) # administrador, supervisor, cajero, carnicero, motorizado, vendedor
    
    # Posición GPS reportada para fuerza de ventas / RTC
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    ubicacion_actualizada_en: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)
    
    status: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())