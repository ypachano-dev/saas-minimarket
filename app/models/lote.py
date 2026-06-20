import datetime
from decimal import Decimal
from sqlalchemy import String, Numeric, ForeignKey, Date, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

class Lote(Base):
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # Llave maestra Multi-Tenant
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False)
    
    # Relación con el producto
    producto_id: Mapped[int] = mapped_column(ForeignKey("producto.id", ondelete="CASCADE"), nullable=False)
    
    # Identificador del lote (puede ser el código del proveedor o la fecha de ingreso)
    codigo_lote: Mapped[str] = mapped_column(String(50), nullable=False)
    
    # Control de cantidades con 3 decimales (indispensable para Kilos de carne o verduras)
    cantidad_inicial: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    cantidad_actual: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    
    # Tiempos críticos
    fecha_ingreso: Mapped[datetime.date] = mapped_column(Date, nullable=False, default=datetime.date.today)
    fecha_vencimiento: Mapped[datetime.date] = mapped_column(Date, nullable=False) # Motor de alertas de caducidad
    
    # Estatus del lote: activo, agotado, vencido
    status: Mapped[str] = mapped_column(String(20), default="activo")
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())