import traceback
from app.db.session import SessionLocal
from app.models.producto import Producto
from app.models.lote import Lote
from sqlalchemy import func

db = SessionLocal()
try:
    print("Simulando query de listar_productos...")
    # Simulating tenant context assignment like the middleware does
    from app.db.session import tenant_context
    tenant_context.set(1)
    
    eid = 1
    stock_subq = (
        db.query(Lote.producto_id, func.coalesce(func.sum(Lote.cantidad_actual), 0).label("stock_total"))
        .filter(Lote.status == "activo")
        .group_by(Lote.producto_id)
        .subquery()
    )
    query = (
        db.query(Producto, func.coalesce(stock_subq.c.stock_total, 0))
        .outerjoin(stock_subq, stock_subq.c.producto_id == Producto.id)
    )
    rows = query.limit(5).all()
    print("Query exitosa. Resultados:", len(rows))
    for prod, stock in rows:
        print(f"Producto: {prod.nombre}, Stock: {stock}")
except Exception as e:
    print("ERROR:", type(e), e)
    traceback.print_exc()
finally:
    db.close()
