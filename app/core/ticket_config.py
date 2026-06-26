"""Configuración estricta de la plantilla de ticket de Caja, parametrizable
por inquilino. Vive separada de negocio_config.py porque es branding de
impresión (papel térmico), no de sector de negocio."""
import enum


class TicketTamanoPapel(str, enum.Enum):
    MM80 = "80mm"
    MM57 = "57mm"


def normalizar_tamano_papel(valor: "str | TicketTamanoPapel | None") -> TicketTamanoPapel:
    """Convierte cualquier valor crudo en un miembro válido de TicketTamanoPapel.
    Nunca lanza excepción: ante un valor desconocido, cae de forma segura a 80mm."""
    if isinstance(valor, TicketTamanoPapel):
        return valor
    try:
        return TicketTamanoPapel(valor)
    except ValueError:
        return TicketTamanoPapel.MM80
