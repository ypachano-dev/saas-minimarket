from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class SaasConfiguracion(Base):
    """Fila única (id=1) con los datos de cobro y branding del proveedor SaaS."""
    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    nombre_proveedor: Mapped[str] = mapped_column(String(100), nullable=False)
    banco_nombre: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    banco_codigo: Mapped[str] = mapped_column(String(10), nullable=False, default="")
    rif: Mapped[str] = mapped_column(String(20), nullable=False, default="")
    telefono_cobro: Mapped[str] = mapped_column(String(20), nullable=False, default="")
    zelle_email: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    zelle_titular: Mapped[str] = mapped_column(String(100), nullable=False, default="")
