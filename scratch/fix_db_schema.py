import sqlite3
from app.db.session import engine
from app.models.base import Base

# Import all models to ensure they are registered in Base.metadata
from app.models.empresa import Empresa
from app.models.usuario import Usuario
from app.models.plan import Plan
from app.models.saas_pago import SaasPago
from app.models.cliente import Cliente
from app.models.producto import Producto
from app.models.factura import Factura
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
from app.models.sincronizacion import ColaSincronizacion

def fix_database_schema():
    conn = sqlite3.connect("saas_minimarket.db")
    cursor = conn.cursor()
    
    # Get all tables in the SQLite database
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    existing_tables = {row[0] for row in cursor.fetchall()}
    print(f"Tablas existentes en base de datos: {len(existing_tables)}")
    
    # Iterate through SQLAlchemy metadata to check each table
    for table_name, table_obj in Base.metadata.tables.items():
        if table_name not in existing_tables:
            print(f"La tabla '{table_name}' no existe físicamente. Se omitirá (debería crearse vía create_all).")
            continue
            
        # Get actual columns of the table
        cursor.execute(f"PRAGMA table_info({table_name})")
        actual_columns = {row[1] for row in cursor.fetchall()}
        
        # Check for columns defined in model but not in database
        for col in table_obj.columns:
            if col.name not in actual_columns:
                print(f"Columna faltante detectada: {table_name}.{col.name}")
                
                # Determine SQLite data type
                type_str = str(col.type).upper()
                if "VARCHAR" in type_str or "STRING" in type_str:
                    sql_type = f"TEXT"
                elif "INTEGER" in type_str or "BOOLEAN" in type_str:
                    sql_type = "INTEGER"
                elif "NUMERIC" in type_str or "DECIMAL" in type_str or "FLOAT" in type_str:
                    sql_type = "NUMERIC"
                elif "DATETIME" in type_str or "DATE" in type_str:
                    sql_type = "TEXT"
                else:
                    sql_type = "TEXT"
                
                # Add default or nullable
                nullable_str = "NULL" if col.nullable else "NOT NULL DEFAULT ''"
                if "INTEGER" in sql_type and not col.nullable:
                    nullable_str = "NOT NULL DEFAULT 0"
                elif "NUMERIC" in sql_type and not col.nullable:
                    nullable_str = "NOT NULL DEFAULT 0.0"
                
                alter_query = f"ALTER TABLE {table_name} ADD COLUMN {col.name} {sql_type} {nullable_str}"
                print(f"Ejecutando alteración: {alter_query}")
                try:
                    cursor.execute(alter_query)
                    print(f"-> Columna '{col.name}' agregada con éxito a la tabla '{table_name}'.")
                except Exception as ex:
                    print(f"-> Error al alterar columna {col.name} en tabla {table_name}: {ex}")
                    
    conn.commit()
    conn.close()
    print("Corrección de esquema de base de datos finalizada!")

if __name__ == "__main__":
    fix_database_schema()
