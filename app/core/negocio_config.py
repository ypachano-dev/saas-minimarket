"""Configuración estricta multi-negocio del SaaS.

Define el Enum TipoNegocio (sector del inquilino) y, a partir de él, la
nomenclatura de inventario/ventas y los módulos activos para cada sector.
También define qué módulo habilitado respalda a cada guía interna de IA
(VALE, YHORGE, ALO), de forma que cada guía se autorice de forma
independiente y no como un bloque agrupado.
"""
import enum
from typing import TypedDict


class TipoNegocio(str, enum.Enum):
    MINIMARKET = "minimarket"
    FERRETERIA = "ferreteria"
    AGROPECUARIA = "agropecuaria"
    FERREAGROPECUARIA = "ferreagropecuaria"


class NomenclaturaNegocio(TypedDict):
    suite: str
    inventario: str
    item_inventario: str
    venta: str


class ConfigNegocio(TypedDict):
    nomenclatura: NomenclaturaNegocio
    modulos_base: list[str]


NEGOCIO_CONFIG: dict[TipoNegocio, ConfigNegocio] = {
    TipoNegocio.MINIMARKET: {
        "nomenclatura": {
            "suite": "3Q Nexus · MiniMarket",
            "inventario": "Productos",
            "item_inventario": "Producto",
            "venta": "Venta",
        },
        "modulos_base": [
            "dashboard", "ingreso", "balanza", "pos", "pedidos", "delivery",
            "crm", "estadisticas", "almacen", "ficha", "tesoreria", "cuentas", "visitas",
        ],
    },
    TipoNegocio.FERRETERIA: {
        "nomenclatura": {
            "suite": "3Q Nexus · Ferretería",
            "inventario": "Herramientas y Materiales",
            "item_inventario": "Artículo",
            "venta": "Despacho",
        },
        "modulos_base": [
            "dashboard", "ingreso", "pos", "pedidos", "delivery",
            "crm", "estadisticas", "almacen", "ficha", "tesoreria", "cuentas", "visitas", "rutas",
        ],
    },
    TipoNegocio.AGROPECUARIA: {
        "nomenclatura": {
            "suite": "3Q Nexus · Agropecuaria",
            "inventario": "Insumos Agropecuarios",
            "item_inventario": "Insumo",
            "venta": "Despacho de Campo",
        },
        "modulos_base": [
            "dashboard", "visitas", "rutas", "ficha", "crm", "estadisticas", "tesoreria", "cuentas",
        ],
    },
    TipoNegocio.FERREAGROPECUARIA: {
        "nomenclatura": {
            "suite": "3Q Nexus · Agroferretería",
            "inventario": "Insumos y Ferretería",
            "item_inventario": "Artículo",
            "venta": "Despacho",
        },
        "modulos_base": [
            "dashboard", "visitas", "rutas", "ficha", "crm", "estadisticas", "tesoreria", "cuentas",
        ],
    },
}

# Valores heredados que existían antes de la segregación en 4 sectores
_LEGACY_TIPO_NEGOCIO: dict[str, TipoNegocio] = {
    "agroferreteria": TipoNegocio.FERREAGROPECUARIA,
}


def normalizar_tipo_negocio(valor: "str | TipoNegocio | None") -> TipoNegocio:
    """Convierte cualquier valor crudo (incl. valores heredados pre-migración)
    en un miembro válido y estricto de TipoNegocio. Nunca lanza excepción:
    ante un valor desconocido, cae de forma segura a MINIMARKET."""
    if isinstance(valor, TipoNegocio):
        return valor
    if not valor:
        return TipoNegocio.MINIMARKET
    if valor in _LEGACY_TIPO_NEGOCIO:
        return _LEGACY_TIPO_NEGOCIO[valor]
    try:
        return TipoNegocio(valor)
    except ValueError:
        return TipoNegocio.MINIMARKET


# Guías internas de IA: cada una atada a un módulo independiente.
# Ya no se conceden como bloque único — cada guía exige su propio módulo activo.
GUIAS_AGENTES_IA: dict[str, str] = {
    "vale": "estadisticas",   # Guía de Análisis / BI
    "yhorge": "cuentas",      # Guía de Control / Administración (Cartera y Tesorería)
    "alo": "crm",             # Guía de Ventas / CRM
}
