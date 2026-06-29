print("SaaS Engine Initializer - Reading file...")
from app.db.session import engine
from app.models.base import Base


# Es CRUCIAL importar todos los modelos explícitamente aquí.
# Si no se importan, SQLAlchemy no sabrá que existen al momento de ejecutar create_all.
from app.models.empresa import Empresa
from app.models.usuario import Usuario
from app.models.plan import Plan
from app.models.saas_pago import SaasPago
from app.models.cliente import Cliente
from app.models.producto import Producto
from app.models.ticket import Ticket
from app.models.lote import Lote
from app.models.merma import Merma
from app.models.tasa import TasaCambio
from app.models.peticion_faltante import PeticionFaltante
from app.models.seguimiento_bot import SeguimientoBot
from app.models.proveedor import Proveedor
from app.models.vehiculo import Vehiculo
from app.models.pedido_delivery import PedidoDelivery
from app.models.orden_compra import OrdenCompra, OrdenCompraItem
from app.models.tesoreria import CuentaTesoreria, MovimientoTesoreria
from app.models.cartera import CuentaPorCobrar, CuentaPorPagar, PagoCxc
from app.models.cobranza import GestionCobranza
from app.models.desposte import Desposte, DesposteItem, DesposteSolicitud
from app.models.turno_caja import TurnoCaja
from app.models.recepcion import RecepcionMercancia, RecepcionMercanciaItem
from app.models.auditoria import AuditoriaInventario, AuditoriaInventarioItem
from app.models.visita import VisitaCliente, EncuestaMarketing, EncuestaInventarioItem
from app.models.orden_venta import OrdenVenta, OrdenVentaItem
from app.models.ruta import RutaVendedor, RutaActividad
from app.models.renglon_gasto import RenglonGasto, PagoRenglon

def crear_estructura_SaaS():
    print("Conectando con base de datos e iniciando creacion de tablas...")
    try:
        # Lee la Metadata de Base y crea las tablas físicas en el orden relacional correcto
        Base.metadata.create_all(bind=engine)
        print("Las tablas se crearon con exito en tu base de datos local.")
        print("Tablas listas: Empresa, Usuario, Cliente, Producto, Ticket, Lote, Merma, TasaCambio, PeticionFaltante, SeguimientoBot, Proveedor, Vehiculo, PedidoDelivery, OrdenCompra, VisitaCliente, EncuestaMarketing, OrdenVenta, RutaVendedor, RutaActividad.")
    except Exception as e:
        print(f"Error fatal al intentar mapear las tablas: {e}")
        print("\nGuia de supervivencia rapido:")
        print("1. Certifica que tu servidor local este encendido.")
        print("2. Verifica que la base de datos especificada ya exista fisicamente.")

if __name__ == "__main__":
    crear_estructura_SaaS()