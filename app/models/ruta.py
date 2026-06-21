import datetime
from decimal import Decimal
from sqlalchemy import String, Integer, ForeignKey, DateTime, Numeric, Text, Boolean, Date, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base

class RutaVendedor(Base):
    __tablename__ = "ruta_vendedor"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False)
    vendedor_id: Mapped[int] = mapped_column(ForeignKey("usuario.id"), nullable=False)
    
    nombre_ruta: Mapped[str] = mapped_column(String(150), nullable=False)
    fecha_inicio: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    fecha_fin: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    
    estatus: Mapped[str] = mapped_column(String(30), default="borrador") # borrador, pendiente_aprobacion, aprobada, rechazada, completada
    
    # Viáticos
    monto_viaticos_solicitado: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))
    monto_viaticos_aprobado: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))
    detalles_viaticos: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    comentarios_gerente: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())
    
    actividades: Mapped[list["RutaActividad"]] = relationship("RutaActividad", back_populates="ruta", cascade="all, delete-orphan")

class RutaActividad(Base):
    __tablename__ = "ruta_actividad"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    ruta_id: Mapped[int] = mapped_column(ForeignKey("ruta_vendedor.id", ondelete="CASCADE"), nullable=False)
    cliente_id: Mapped[int | None] = mapped_column(ForeignKey("cliente.id", ondelete="SET NULL"), nullable=True)
    
    fecha_planificada: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    actividad_planificada: Mapped[str] = mapped_column(String(255), nullable=False)
    
    ejecutada: Mapped[bool] = mapped_column(Boolean, default=False)
    comentarios_avance: Mapped[str | None] = mapped_column(Text, nullable=True)

    foto_soporte_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    factura_soporte_monto: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)

    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())
    actualizado_en: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)
    
    ruta: Mapped[RutaVendedor] = relationship("RutaVendedor", back_populates="actividades")
