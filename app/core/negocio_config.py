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
    CARNICERIA = "carniceria"
    FERRETERIA = "ferreteria"
    AGROFERRETERIA = "agroferreteria"
    AGROPECUARIA = "agropecuaria"


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
            "crm", "estadisticas", "almacen", "ficha", "tesoreria", "cuentas", "visitas", "facturacion",
        ],
    },
    TipoNegocio.CARNICERIA: {
        "nomenclatura": {
            "suite": "3Q Nexus · Carnicería",
            "inventario": "Cortes y Productos",
            "item_inventario": "Corte/Pieza",
            "venta": "Pesaje/Venta",
        },
        "modulos_base": [
            "dashboard", "ingreso", "balanza", "pos", "almacen", "desposte",
            "crm", "estadisticas", "tesoreria", "cuentas", "ficha", "facturacion",
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
            "dashboard", "ingreso", "pos", "almacen", "crm", "estadisticas", 
            "tesoreria", "cuentas", "ficha", "pedidos", "delivery", "facturacion",
        ],
    },
    TipoNegocio.AGROFERRETERIA: {
        "nomenclatura": {
            "suite": "3Q Nexus · AgroFerretería",
            "inventario": "Insumos y Ferretería",
            "item_inventario": "Artículo",
            "venta": "Despacho",
        },
        "modulos_base": [
            "dashboard", "ingreso", "pos", "almacen", "crm", "estadisticas", 
            "tesoreria", "cuentas", "ficha", "visitas", "rutas", "pedidos", "facturacion",
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
            "dashboard", "visitas", "rutas", "ficha", "crm", "estadisticas", 
            "tesoreria", "cuentas", "almacen", "pedidos", "facturacion",
        ],
    },
}

# Valores heredados para retrocompatibilidad
_LEGACY_TIPO_NEGOCIO: dict[str, TipoNegocio] = {
    "agroferreteria": TipoNegocio.AGROFERRETERIA,
    "ferreagropecuaria": TipoNegocio.AGROFERRETERIA,
}


def normalizar_tipo_negocio(valor: "str | TipoNegocio | None") -> TipoNegocio:
    """Convierte cualquier valor crudo en un miembro de TipoNegocio.
    Cae de forma segura a MINIMARKET ante valores desconocidos."""
    if isinstance(valor, TipoNegocio):
        return valor
    if not valor:
        return TipoNegocio.MINIMARKET
    val_lower = str(valor).lower().strip()
    if val_lower in _LEGACY_TIPO_NEGOCIO:
        return _LEGACY_TIPO_NEGOCIO[val_lower]
    try:
        return TipoNegocio(val_lower)
    except ValueError:
        return TipoNegocio.MINIMARKET


# Guías internas de IA: cada una atada a un módulo independiente.
# Ya no se conceden como bloque único — cada guía exige su propio módulo activo.
GUIAS_AGENTES_IA: dict[str, str] = {
    "vale": "estadisticas",   # Guía de Análisis / BI
    "yhorge": "cuentas",      # Guía de Control / Administración (Cartera y Tesorería)
    "alo": "crm",             # Guía de Ventas / CRM
}
