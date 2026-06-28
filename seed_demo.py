import datetime
from decimal import Decimal
from app.db.session import SessionLocal
from app.models.empresa import Empresa
from app.models.usuario import Usuario
from app.models.tasa import TasaCambio
from app.models.producto import Producto
from app.models.lote import Lote
from app.models.cliente import Cliente
from app.models.ticket import Ticket
from app.models.turno_caja import TurnoCaja
from app.models.visita import VisitaCliente, EncuestaMarketing
from app.models.orden_venta import OrdenVenta, OrdenVentaItem
from app.models.ruta import RutaVendedor, RutaActividad
from app.core.security import generar_hash_password

db = SessionLocal()

# ----------------------------------------------------
# 1. EMPRESAS (Minimarket EID=1, Agroferretería EID=2)
# ----------------------------------------------------
emp1 = db.query(Empresa).filter(Empresa.id == 1).first()
if not emp1:
    emp1 = Empresa(
        id=1, rif="J-12345678-9", nombre_comercial="MiniMarket Express",
        tipo_negocio="minimarket", color_primario="#00ebc7", color_secundario="#111936",
        status="activo"
    )
    db.add(emp1)
else:
    emp1.tipo_negocio = "minimarket"

emp2 = db.query(Empresa).filter(Empresa.id == 2).first()
if not emp2:
    emp2 = Empresa(
        id=2, rif="J-98765432-1", nombre_comercial="AgroFerretería El Campo",
        tipo_negocio="agroferreteria", color_primario="#10b981", color_secundario="#064e3b",
        status="activo"
    )
    db.add(emp2)
db.flush()

# ----------------------------------------------------
# 2. USUARIOS (Admin y Vendedor para Agroferretería)
# ----------------------------------------------------
u_admin = db.query(Usuario).filter(Usuario.email == "admin_agro@agro.com").first()
if not u_admin:
    u_admin = Usuario(
        empresa_id=2, nombre="Carlos Gerente Agro", email="admin_agro@agro.com",
        password_hash=generar_hash_password("Demo1234"), rol="admin", status=True
    )
    db.add(u_admin)

u_vendedor = db.query(Usuario).filter(Usuario.email == "vendedor@agro.com").first()
if not u_vendedor:
    u_vendedor = Usuario(
        empresa_id=2, nombre="Juan Vendedor RTC", email="vendedor@agro.com",
        password_hash=generar_hash_password("Demo1234"), rol="vendedor", status=True,
        lat=10.4806, lng=-66.9036, ubicacion_actualizada_en=datetime.datetime.now()
    )
    db.add(u_vendedor)
db.flush()

# ----------------------------------------------------
# 3. TASAS DE CAMBIO
# ----------------------------------------------------
tasa1 = db.query(TasaCambio).filter(TasaCambio.empresa_id == 1).first()
if not tasa1:
    db.add(TasaCambio(empresa_id=1, valor_bcv=Decimal("36.50"), valor_eur=Decimal("39.80")))

tasa2 = db.query(TasaCambio).filter(TasaCambio.empresa_id == 2).first()
if not tasa2:
    db.add(TasaCambio(empresa_id=2, valor_bcv=Decimal("36.50"), valor_eur=Decimal("39.80")))
db.flush()

# ----------------------------------------------------
# 4. PRODUCTOS Y LOTES
# ----------------------------------------------------
# Empresa 1 (MiniMarket)
productos_m = [
    ("P001", "Harina PAN", Decimal("1.20"), "Alimentos"),
    ("P002", "Aceite Vatel 1L", Decimal("3.50"), "Alimentos"),
    ("P003", "Arroz Primor 1kg", Decimal("2.10"), "Alimentos"),
]
for cod, nombre, precio, linea in productos_m:
    p = db.query(Producto).filter(Producto.empresa_id == 1, Producto.codigo_interno == cod).first()
    if not p:
        p = Producto(
            empresa_id=1, codigo_interno=cod, nombre=nombre, linea=linea,
            costo_usd=precio * Decimal("0.7"), precio_1_detalle=precio, stock_minimo=Decimal("5")
        )
        db.add(p)
        db.flush()
        db.add(Lote(
            empresa_id=1, producto_id=p.id, codigo_lote=f"L-{cod}",
            cantidad_inicial=Decimal("50"), cantidad_actual=Decimal("50"),
            fecha_vencimiento=datetime.date.today() + datetime.timedelta(days=120), status="activo"
        ))

# Empresa 2 (Agroferretería)
productos_a = [
    ("A001", "Fertilizante NPK 15-15-15 (Saco 50kg)", Decimal("45.00"), "Agroquímicos"),
    ("A002", "Machete Bellota 22 Pulgadas", Decimal("18.50"), "Herramientas"),
    ("A003", "Semillas de Tomate Híbrido (100g)", Decimal("22.00"), "Semillas"),
    ("A004", "Bomba de Riego Gasolina 2 HP", Decimal("180.00"), "Maquinaria"),
    ("A005", "Insecticida Cipermetrina 1L", Decimal("12.00"), "Agroquímicos"), # Este lo dejaremos sin stock para probar backorders
]
prod_agro_instances = {}
for cod, nombre, precio, linea in productos_a:
    p = db.query(Producto).filter(Producto.empresa_id == 2, Producto.codigo_interno == cod).first()
    if not p:
        p = Producto(
            empresa_id=2, codigo_interno=cod, nombre=nombre, linea=linea,
            costo_usd=precio * Decimal("0.75"), precio_1_detalle=precio, stock_minimo=Decimal("2")
        )
        db.add(p)
        db.flush()
        # Se añade stock para todos excepto A005
        if cod != "A005":
            db.add(Lote(
                empresa_id=2, producto_id=p.id, codigo_lote=f"L-{cod}",
                cantidad_inicial=Decimal("20"), cantidad_actual=Decimal("20"),
                fecha_vencimiento=datetime.date.today() + datetime.timedelta(days=360), status="activo"
            ))
    prod_agro_instances[cod] = p
db.flush()

# ----------------------------------------------------
# 5. CLIENTES
# ----------------------------------------------------
c_demo1 = db.query(Cliente).filter(Cliente.empresa_id == 1, Cliente.cedula == "V-00000000").first()
if not c_demo1:
    c_demo1 = Cliente(empresa_id=1, cedula="V-00000000", nombre="Cliente Demo Express")
    db.add(c_demo1)

c_demo2 = db.query(Cliente).filter(Cliente.empresa_id == 2, Cliente.cedula == "J-40123456-0").first()
if not c_demo2:
    c_demo2 = Cliente(
        empresa_id=2, cedula="J-40123456-0", nombre="Hacienda La Coromoto",
        telefono="+584149876543", email="coromoto@hacienda.com",
        direccion="Carretera Nacional Km 12, Barinas", limite_credito=Decimal("2000.00")
    )
    db.add(c_demo2)

c_demo3 = db.query(Cliente).filter(Cliente.empresa_id == 2, Cliente.cedula == "J-30765432-1").first()
if not c_demo3:
    c_demo3 = Cliente(
        empresa_id=2, cedula="J-30765432-1", nombre="Agropecuaria El Torito",
        telefono="+584241234567", email="torito@agro.com",
        direccion="Sector Sabaneta, Calle Principal, Barinas", limite_credito=Decimal("5000.00")
    )
    db.add(c_demo3)
db.flush()

# ----------------------------------------------------
# 6. TICKETS DE DELIVIERIES (Minimarket EID=1)
# ----------------------------------------------------
tickets_count = db.query(Ticket).filter(Ticket.empresa_id == 1).count()
if tickets_count == 0:
    tickets_data = [
        ("Av. 23 de Enero, Barinas", 1, 120.0, 90.0, Decimal("1.20")),
        ("Av. Briceño Méndez, Barinas", 1, 300.0, 240.0, Decimal("3.50")),
    ]
    p_m1 = db.query(Producto).filter(Producto.empresa_id == 1).first()
    for direccion, repartidor_id, x, y, monto in tickets_data:
        db.add(Ticket(
            empresa_id=1, usuario_id=1, producto_id=p_m1.id, cliente_id=c_demo1.id,
            peso=Decimal("1.000"), monto_usd=monto, status="procesado",
            direccion_entrega=direccion, repartidor_id=repartidor_id,
            coord_x=x, coord_y=y
        ))

# ----------------------------------------------------
# 7. NUEVOS DATOS SEMILLA (Visitas, Pedidos, Rutas)
# ----------------------------------------------------
# Vendedor de la Agroferretería (Juan Vendedor)
vendedor = db.query(Usuario).filter(Usuario.email == "vendedor@agro.com").first()
cliente_agro = db.query(Cliente).filter(Cliente.empresa_id == 2, Cliente.cedula == "J-40123456-0").first()

if vendedor and cliente_agro:
    # A. Visita y Encuesta de Marketing
    visita_prev = db.query(VisitaCliente).filter(VisitaCliente.cliente_id == cliente_agro.id).first()
    if not visita_prev:
        visita = VisitaCliente(
            empresa_id=2, vendedor_id=vendedor.id, cliente_id=cliente_agro.id,
            fecha_visita=datetime.datetime.now() - datetime.timedelta(days=2),
            comentarios="Cliente satisfecho con la última entrega de Machetes. Solicita información sobre semillas híbridas.",
            lat=10.4820, lng=-66.9040
        )
        db.add(visita)
        db.flush()
        db.add(EncuestaMarketing(
            visita_id=visita.id,
            inventario_cliente="Machete Bellota: 5 un, Fertilizante NPK: 2 sacos",
            rotacion_productos="Machetes: Rápida, Fertilizante: Lenta",
            comentarios_adicionales="Competencia ofreciendo fertilizante importado más económico."
        ))

    # B. Ordenes de Venta (Presupuesto y Backorder)
    orden_prev = db.query(OrdenVenta).filter(OrdenVenta.cliente_id == cliente_agro.id).first()
    if not orden_prev:
        # Presupuesto (Cotización)
        p1 = prod_agro_instances["A002"] # Machete
        p2 = prod_agro_instances["A003"] # Semillas
        op = OrdenVenta(
            empresa_id=2, vendedor_id=vendedor.id, cliente_id=cliente_agro.id,
            tipo="presupuesto", total_usd=Decimal("59.00"), estatus="pendiente",
            notas="Presupuesto solicitado por el capataz."
        )
        db.add(op)
        db.flush()
        db.add(OrdenVentaItem(orden_venta_id=op.id, producto_id=p1.id, cantidad=Decimal("2"), precio_unitario=Decimal("18.50"), monto_usd=Decimal("37.00")))
        db.add(OrdenVentaItem(orden_venta_id=op.id, producto_id=p2.id, cantidad=Decimal("1"), precio_unitario=Decimal("22.00"), monto_usd=Decimal("22.00")))
        
        # Pedido con Stock Cero (Backorder)
        p_cero = prod_agro_instances["A005"] # Insecticida (sin stock)
        ob = OrdenVenta(
            empresa_id=2, vendedor_id=vendedor.id, cliente_id=cliente_agro.id,
            tipo="pedido", total_usd=Decimal("60.00"), estatus="pendiente",
            notas="Backorder de insecticidas urgentes."
        )
        db.add(ob)
        db.flush()
        db.add(OrdenVentaItem(orden_venta_id=ob.id, producto_id=p_cero.id, cantidad=Decimal("5"), precio_unitario=Decimal("12.00"), monto_usd=Decimal("60.00")))

    # C. Rutas y Viáticos
    ruta_prev = db.query(RutaVendedor).filter(RutaVendedor.vendedor_id == vendedor.id).first()
    if not ruta_prev:
        ruta = RutaVendedor(
            empresa_id=2, vendedor_id=vendedor.id,
            nombre_ruta="Ruta Norte Llanera (Semana 26)",
            fecha_inicio=datetime.date.today(),
            fecha_fin=datetime.date.today() + datetime.timedelta(days=5),
            estatus="pendiente_aprobacion",
            monto_viaticos_solicitado=Decimal("150.00"),
            monto_viaticos_aprobado=Decimal("0.00"),
            detalles_viaticos="Combustible: $50, Alimentación (5 días): $60, Hospedaje (2 noches): $40"
        )
        db.add(ruta)
        db.flush()
        
        db.add(RutaActividad(
            ruta_id=ruta.id, cliente_id=cliente_agro.id,
            fecha_planificada=datetime.date.today(),
            actividad_planificada="Visita de seguimiento y encuesta de inventario.",
            ejecutada=False
        ))
        cliente_torito = db.query(Cliente).filter(Cliente.empresa_id == 2, Cliente.cedula == "J-30765432-1").first()
        if cliente_torito:
            db.add(RutaActividad(
                ruta_id=ruta.id, cliente_id=cliente_torito.id,
                fecha_planificada=datetime.date.today() + datetime.timedelta(days=1),
                actividad_planificada="Presentación del catálogo de bombas de riego.",
                ejecutada=False
            ))

db.commit()
db.close()
print("Datos demo actualizados con exito. Empresa 1 (MiniMarket) y Empresa 2 (Agroferreteria) sembradas de forma exitosa.")

