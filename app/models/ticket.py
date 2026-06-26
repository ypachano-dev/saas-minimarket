import datetime
from decimal import Decimal
from sqlalchemy import String, Numeric, Integer, Float, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

class Ticket(Base):
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # Llave maestra Multi-Tenant (Ningún minimarket puede ver los tickets de otro)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False)
    
    # Quién generó el pesaje (El carnicero o pesador de verduras)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuario.id"), nullable=False)
    
    # Qué producto se está despachando
    producto_id: Mapped[int] = mapped_column(ForeignKey("producto.id"), nullable=False)

    # ¡NUEVA COLUMNA CONECTADA AL CRM! A qué cliente pertenece este pesaje virtual
    cliente_id: Mapped[int] = mapped_column(ForeignKey("cliente.id"), nullable=False)
    
    # Precisión de balanza: 3 decimales para el Kilogramo exacto (Ej. 2.755 kg de lomo)
    peso: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    
    # Monto calculado en tiempo real basado en el precio del producto al momento del pesaje
    monto_usd: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    
    # Ciclo de vida del ticket digital
    # pendiente: creado en carnicería/pesaje
    # procesado: pagado y cerrado en caja
    # cancelado: anulado por merma o error
    status: Mapped[str] = mapped_column(String(20), default="pendiente")

    # Delivery: dirección de entrega, repartidor asignado y ubicación en el mapa
    direccion_entrega: Mapped[str | None] = mapped_column(String(255), nullable=True)
    repartidor_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    coord_x: Mapped[float] = mapped_column(Float, default=250.0)
    coord_y: Mapped[float] = mapped_column(Float, default=180.0)

    # Control de Turnos y Arqueo de Caja: a qué turno pertenece esta venta y con qué
    # método se cobró (nullable: tickets anteriores a esta feature no tienen turno).
    turno_id: Mapped[int | None] = mapped_column(ForeignKey("turnocaja.id"), nullable=True)
    metodo_pago: Mapped[str | None] = mapped_column(String(30), nullable=True)

    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())