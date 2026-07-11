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
