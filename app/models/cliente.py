import datetime
from decimal import Decimal
from sqlalchemy import String, Numeric, ForeignKey, DateTime, func, UniqueConstraint, Text, Float
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

class Cliente(Base):
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # Llave maestra SaaS: El Minimarket A y el Minimarket B pueden tener al mismo cliente registrado en sus propios sistemas
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False)

    # Identificación única por negocio
    cedula: Mapped[str] = mapped_column(String(30), nullable=False) # Soporta formatos como V-12345678 o E-81234567
    nombre: Mapped[str] = mapped_column(String(150), nullable=False)

    # Datos de contacto clave para el módulo de CRM, Postventa y Delivery
    telefono: Mapped[str | None] = mapped_column(String(30), nullable=True) # Ej. +584141234567
    email: Mapped[str | None] = mapped_column(String(100), nullable=True)
    instagram: Mapped[str | None] = mapped_column(String(100), nullable=True)
    telegram: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Dirección y ubicación física para visitas de vendedores y entregas
    direccion: Mapped[str | None] = mapped_column(Text, nullable=True)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    foto_fachada_url: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Límite de fiado/crédito autorizado para el módulo de Cartera y Créditos (CxC)
    limite_credito: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=0)

    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())

    # Restricción compuesta: La cédula debe ser única dentro de la misma empresa
    __table_args__ = (
        UniqueConstraint("cedula", "empresa_id", name="uq_cedula_empresa"),
    )