import datetime
from sqlalchemy import String, Integer, Float, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base

class OrdenCompra(Base):
    __tablename__ = "orden_compra"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # Aislamiento Multi-Tenant
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False)
    
    proveedor: Mapped[str] = mapped_column(String(150), nullable=False)
    items_count: Mapped[int] = mapped_column(Integer, nullable=False)
    total_usd: Mapped[float] = mapped_column(Float, nullable=False)
    origen: Mapped[str] = mapped_column(String(100), default="Borrador Auditado")
    estatus: Mapped[str] = mapped_column(String(30), default="Pendiente")
    
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())
    
    # Relación uno-a-muchos con los renglones de la orden
    items: Mapped[list["OrdenCompraItem"]] = relationship("OrdenCompraItem", back_populates="orden", cascade="all, delete-orphan")

class OrdenCompraItem(Base):
    __tablename__ = "orden_compra_item"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    orden_id: Mapped[int] = mapped_column(ForeignKey("orden_compra.id", ondelete="CASCADE"), nullable=False)
    
    producto_nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    cantidad: Mapped[float] = mapped_column(Float, nullable=False)
    costo: Mapped[float] = mapped_column(Float, nullable=False)
    
    orden: Mapped[OrdenCompra] = relationship("OrdenCompra", back_populates="items")
