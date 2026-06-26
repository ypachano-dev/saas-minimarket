"""Seed idempotente: agrega productos demo de Verdulería y Frutas / Charcutería
para la empresa 1 (MiniMarket), departamentos que existían en el catálogo de
Balanza Digital pero sin ningún producto real -> por eso 'Acceso Rápido por
Peso' mostraba el recuadro vacío al pulsar esas pestañas."""
import datetime
from decimal import Decimal

from app.db.session import SessionLocal
from app.models.empresa import Empresa
from app.models.producto import Producto
from app.models.lote import Lote

db = SessionLocal()

PRODUCTOS_DEMO = [
    ("V001", "Tomate Manzano", Decimal("1.20"), "Verdulería y Frutas"),
    ("V002", "Cebolla Blanca", Decimal("0.95"), "Verdulería y Frutas"),
    ("C001", "Queso Paisa", Decimal("4.50"), "Charcutería"),
    ("CH002", "Jamón de Pavo Plumrose", Decimal("3.80"), "Charcutería"),
]

for cod, nombre, precio, linea in PRODUCTOS_DEMO:
    p = db.query(Producto).filter(Producto.empresa_id == 1, Producto.codigo_interno == cod).first()
    if p:
        print(f"Ya existe {cod} ({nombre}), se omite.")
        continue
    p = Producto(
        empresa_id=1, codigo_interno=cod, nombre=nombre, linea=linea,
        tipo_venta="peso", perecedero=True,
        costo_usd=precio * Decimal("0.7"), precio_1_detalle=precio, stock_minimo=Decimal("2"),
    )
    db.add(p)
    db.flush()
    db.add(Lote(
        empresa_id=1, producto_id=p.id, codigo_lote=f"L-{cod}",
        cantidad_inicial=Decimal("30"), cantidad_actual=Decimal("30"),
        fecha_vencimiento=datetime.date.today() + datetime.timedelta(days=15), status="activo",
    ))
    print(f"Creado {cod} ({nombre}) en línea '{linea}'.")

db.commit()
db.close()
print("Listo.")
