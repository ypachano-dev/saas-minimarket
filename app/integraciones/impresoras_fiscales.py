"""Punto de extensión para la integración directa con impresoras/máquinas
fiscales por marca.

LEO ESTO ANTES DE "IMPLEMENTAR" UN DRIVER NUEVO:

Este backend corre en la nube (Render/DigitalOcean). Una impresora fiscal está
conectada por USB o puerto serial a la PC de caja, físicamente en la tienda
del cliente. El backend en la nube NO PUEDE hablar con ese puerto directamente
— no hay forma de que un servidor remoto abra un COM/USB de una máquina en
Venezuela. La única forma real de automatizar la emisión es con un AGENTE
LOCAL: un programa instalado en esa misma PC (normalmente Windows, porque casi
todos los SDK de fabricantes de impresoras fiscales venezolanas son DLLs o
componentes COM/ActiveX de Windows) que:

  1. Habla con la impresora usando el SDK/protocolo propietario del fabricante.
  2. Expone un servicio local (ej. http://127.0.0.1:PUERTO) que el navegador,
     corriendo en esa misma red, puede llamar para pedir "emite esta factura".
  3. Devuelve el Número de Comprobante Fiscal que la máquina imprimió, para que
     el frontend lo cargue en el campo `nro_control_manual` de este backend
     (ver app/routers/facturacion.py) — automatizando lo que hoy el cajero
     escribe a mano.

Es decir: un driver "real" aquí no es solo código Python en este repo — es un
proyecto aparte (el agente local) por cada marca, que requiere el SDK/manual
de comandos oficial del fabricante Y un equipo físico para probarlo. No existe
forma honesta de escribir uno funcional sin eso.

Este archivo define el *contrato* (la interfaz que cualquier integración futura
debe cumplir) y un registro de qué marca tiene qué nivel de soporte, para que:
  - La Configuración de la empresa (ver ConfiguracionTienda.tsx) pueda mostrar
    honestamente "automática" vs. "manual" según la marca elegida.
  - Agregar una marca real el día de mañana sea aislado: se implementa una
    clase nueva acá y se registra en DRIVERS_DISPONIBLES, sin tocar el resto
    del sistema (el flujo de facturación ya acepta nro_control_manual venga
    de donde venga).
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional

from app.core.facturacion_config import MarcaImpresoraFiscal


@dataclass
class ComprobanteFiscalEmitido:
    nro_comprobante_fiscal: str
    serial_maquina: Optional[str] = None


class ImpresoraFiscalDriver(ABC):
    """Contrato que debe cumplir la integración real de una marca. Vive
    conceptualmente del lado del AGENTE LOCAL (no de este backend en la nube):
    esta clase es la referencia de qué debe implementar ese agente, y el
    "how" de cómo el agente y el navegador se coordinan queda a definir junto
    con el fabricante concreto."""

    marca: MarcaImpresoraFiscal

    @abstractmethod
    def emitir(self, factura_data: dict) -> ComprobanteFiscalEmitido:
        """Envía la venta a la impresora fiscal y devuelve el comprobante que
        esta emitió físicamente en papel."""
        raise NotImplementedError


# Estado real de soporte por marca. Todas en "manual" hasta tener el SDK del
# fabricante + un equipo físico para probar — ver el docstring del módulo.
# Cuando una marca tenga integración real, se agrega su driver concreto acá y
# se cambia su entrada a la clase del driver en vez de None.
DRIVERS_DISPONIBLES: dict[MarcaImpresoraFiscal, Optional[type[ImpresoraFiscalDriver]]] = {
    MarcaImpresoraFiscal.THE_FACTORY_HKA: None,
    MarcaImpresoraFiscal.HASLER: None,
    MarcaImpresoraFiscal.FIDELIO: None,
    MarcaImpresoraFiscal.BEMOVA: None,
    MarcaImpresoraFiscal.PNP: None,
    MarcaImpresoraFiscal.ZEUS: None,
    MarcaImpresoraFiscal.OTRA: None,
}


def tiene_integracion_automatica(marca: Optional[MarcaImpresoraFiscal]) -> bool:
    """True solo si existe un driver real registrado para esa marca. Hoy
    siempre False: todas las marcas dependen del registro manual del
    comprobante que la máquina ya imprimió."""
    if marca is None:
        return False
    return DRIVERS_DISPONIBLES.get(marca) is not None
