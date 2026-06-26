import datetime
from sqlalchemy import String, Text, DateTime, Boolean, Enum as SAEnum, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base
from app.core.negocio_config import TipoNegocio
from app.core.ticket_config import TicketTamanoPapel

class Empresa(Base):
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    rif: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    nombre_comercial: Mapped[str] = mapped_column(String(100), nullable=False)
    # Nombre corto para branding compacto (sidebar, encabezados, avatar)
    nombre_corto: Mapped[str | None] = mapped_column(String(30), nullable=True)
    razon_social: Mapped[str | None] = mapped_column(String(100), nullable=True)
    telefono: Mapped[str | None] = mapped_column(String(20), nullable=True)
    direccion: Mapped[str | None] = mapped_column(Text, nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Personalización visual de la interfaz por cliente
    color_primario: Mapped[str] = mapped_column(String(7), default="#00ebc7")
    color_secundario: Mapped[str] = mapped_column(String(7), default="#111936")

    # Sector del inquilino (Enum estricto): determina nomenclatura y módulos activos.
    # native_enum=False -> se guarda como VARCHAR + CHECK, compatible con SQLite y MySQL.
    tipo_negocio: Mapped[TipoNegocio] = mapped_column(
        SAEnum(TipoNegocio, values_callable=lambda e: [m.value for m in e], native_enum=False, length=30),
        default=TipoNegocio.MINIMARKET,
        nullable=False,
    )

    # Activación independiente de cada guía de IA para este inquilino (además de
    # depender de que su sector tenga habilitado el módulo que la respalda).
    agente_vale_activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    agente_yhorge_activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    agente_alo_activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Plantilla de ticket de Caja parametrizable por inquilino
    ticket_tamano_papel: Mapped[TicketTamanoPapel] = mapped_column(
        SAEnum(TicketTamanoPapel, values_callable=lambda e: [m.value for m in e], native_enum=False, length=10),
        default=TicketTamanoPapel.MM80,
        nullable=False,
    )
    ticket_mostrar_logo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    ticket_mostrar_rif: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    ticket_texto_cabecera: Mapped[str | None] = mapped_column(Text, nullable=True)
    ticket_texto_pie: Mapped[str | None] = mapped_column(Text, nullable=True)
    ticket_desglosar_impuestos: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    status: Mapped[str] = mapped_column(String(20), default="activo") # activo, suspendido
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())