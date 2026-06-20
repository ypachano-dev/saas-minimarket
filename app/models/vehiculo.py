import datetime
from sqlalchemy import String, Float, ForeignKey, DateTime, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

class Vehiculo(Base):
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # Llave maestra Multi-Tenant
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False)

    # Placa única por empresa
    placa: Mapped[str] = mapped_column(String(30), nullable=False)
    marca: Mapped[str] = mapped_column(String(50), nullable=False)
    modelo: Mapped[str] = mapped_column(String(50), nullable=False)

    # Tipo de vehículo (Moto, Carro, Camión, etc.)
    tipo: Mapped[str] = mapped_column(String(30), nullable=False)

    # Estatus del vehículo (Operativo, Mantenimiento, Inactivo)
    status: Mapped[str] = mapped_column(String(30), default="Operativo")

    # Última posición GPS reportada por el repartidor desde su celular (tracking en vivo)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    ubicacion_actualizada_en: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())

    # Restricción compuesta: La placa debe ser única dentro de la misma empresa
    __table_args__ = (
        UniqueConstraint("placa", "empresa_id", name="uq_placa_vehiculo_empresa"),
    )
