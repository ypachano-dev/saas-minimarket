import datetime
from decimal import Decimal
from sqlalchemy import Numeric, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

class TasaCambio(Base):
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # Relación única: cada empresa mantiene una sola tasa BCV vigente
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresa.id", ondelete="CASCADE"), unique=True, nullable=False)

    # Bolívares por Dólar, según la tasa oficial publicada por el BCV (https://www.bcv.org.ve/)
    valor_bcv: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)

    # Bolívares por Euro, según la tasa oficial publicada por el BCV. Nullable porque
    # las empresas que ya tenían tasa registrada antes de esta función no la tienen aún.
    valor_eur: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)

    fecha_actualizacion: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
