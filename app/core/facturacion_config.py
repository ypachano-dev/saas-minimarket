"""Modalidad de homologación fiscal ante el SENIAT para la emisión de
facturas, parametrizable por inquilino. El Número de Control de una factura
venezolana NO puede generarlo libremente el software: debe provenir de un
formato pre-impreso por una imprenta autorizada, o de una impresora/máquina
fiscal certificada. Cada empresa cliente elige cuál de las dos aplica."""
import enum


class ModalidadFacturacion(str, enum.Enum):
    IMPRENTA = "imprenta"
    MAQUINA_FISCAL = "maquina_fiscal"


def normalizar_modalidad_facturacion(valor: "str | ModalidadFacturacion | None") -> ModalidadFacturacion:
    """Convierte cualquier valor crudo en un miembro válido de ModalidadFacturacion.
    Nunca lanza excepción: ante un valor desconocido, cae de forma segura a IMPRENTA."""
    if isinstance(valor, ModalidadFacturacion):
        return valor
    try:
        return ModalidadFacturacion(valor)
    except ValueError:
        return ModalidadFacturacion.IMPRENTA


class MarcaImpresoraFiscal(str, enum.Enum):
    """Marcas de impresora/máquina fiscal comunes en Venezuela. Cada una usa un
    protocolo/SDK propietario distinto (normalmente un DLL o puerto serial con
    comandos propios del fabricante) — no existe un protocolo genérico único.
    Ver app/integraciones/impresoras_fiscales.py para el estado real de cada driver."""
    THE_FACTORY_HKA = "the_factory_hka"
    HASLER = "hasler"
    FIDELIO = "fidelio"
    BEMOVA = "bemova"
    PNP = "pnp"
    ZEUS = "zeus"
    OTRA = "otra"


def normalizar_marca_impresora_fiscal(valor: "str | MarcaImpresoraFiscal | None") -> "MarcaImpresoraFiscal | None":
    """A diferencia de la modalidad, aquí None es un valor legítimo: significa
    que la empresa todavía no indicó qué marca de impresora fiscal tiene."""
    if valor is None:
        return None
    if isinstance(valor, MarcaImpresoraFiscal):
        return valor
    try:
        return MarcaImpresoraFiscal(valor)
    except ValueError:
        return None
