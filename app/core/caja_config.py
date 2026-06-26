"""Configuración estricta del Control de Turnos y Arqueo de Caja."""
import enum


class EstadoTurno(str, enum.Enum):
    ABIERTO = "ABIERTO"
    CERRADO = "CERRADO"


# Métodos de pago aceptados en Caja/POS. Debe coincidir exactamente con
# METODOS_PAGO en frontend/src/components/ModuloCaja.tsx.
METODOS_PAGO_CAJA: list[str] = ["Efectivo $", "Efectivo Bs", "Punto de Venta", "Pago Móvil"]

# Único método cobrado y reportado en bolívares; todos los demás se cobran
# en su equivalente USD (igual que el resto del sistema, donde el precio
# base de cada producto siempre está en dólares).
METODO_PAGO_VES = "Efectivo Bs"
