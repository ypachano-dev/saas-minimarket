from sqlalchemy import String, Boolean, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class Plan(Base):
    """Catálogo editable de planes de suscripción (Básico/Pro/Max).

    'modulos' guarda un dict {"clave_modulo": bool} con las mismas claves que
    MODULOS_ERP en el frontend (dashboard, ingreso, pos, pedidos, delivery,
    crm, estadisticas, almacen, tesoreria, ficha). Se usa para precargar
    Empresa.modulos_override cuando se elige este plan al crear una empresa.
    """
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    precio_mensual: Mapped[float] = mapped_column(nullable=False)
    limite_usuarios: Mapped[int] = mapped_column(nullable=False)
    modulos: Mapped[dict] = mapped_column(JSON, nullable=False)
    agente_vale_incluido: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    agente_yhorge_incluido: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    agente_alo_incluido: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
