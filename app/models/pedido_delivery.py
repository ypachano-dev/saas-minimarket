import datetime
from sqlalchemy import String, Integer, Float, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

class PedidoDelivery(Base):
    __tablename__ = "pedido_delivery"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # Aislamiento Multi-Tenant
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False)
    
    cliente_nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    cliente_telefono: Mapped[str] = mapped_column(String(30), nullable=False)
    cliente_direccion: Mapped[str | None] = mapped_column(String(255), nullable=True)
    
    vehiculo_id: Mapped[int | None] = mapped_column(ForeignKey("vehiculo.id", ondelete="SET NULL"), nullable=True)
    chofer_cedula: Mapped[str] = mapped_column(String(30), nullable=False)
    
    origen: Mapped[str] = mapped_column(String(255), nullable=False)
    origen_lat: Mapped[float] = mapped_column(Float, nullable=False)
    origen_lng: Mapped[float] = mapped_column(Float, nullable=False)
    
    destino: Mapped[str] = mapped_column(String(255), nullable=False)
    destino_lat: Mapped[float] = mapped_column(Float, nullable=False)
    destino_lng: Mapped[float] = mapped_column(Float, nullable=False)
    
    distancia_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    eta_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    
    # CREADO, ARMADO, FACTURADO, EN_VIA, DESPACHADO, PAGADO, CREDITO
    estado: Mapped[str] = mapped_column(String(30), default="CREADO")
    metodo_pago: Mapped[str] = mapped_column(String(50), nullable=False)
    monto_total: Mapped[float] = mapped_column(Float, nullable=False)
    notas: Mapped[str | None] = mapped_column(String(255), nullable=True)
    
    # SVG coordinates mapped for real-time tracking dashboard
    coord_x: Mapped[float] = mapped_column(Float, default=250.0)
    coord_y: Mapped[float] = mapped_column(Float, default=180.0)
    
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())
