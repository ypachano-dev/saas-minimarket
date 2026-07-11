import traceback
from app.db.session import SessionLocal
from app.models.producto import Producto

db = SessionLocal()
try:
    print("Consultando productos...")
    prods = db.query(Producto).limit(5).all()
    print("Productos recuperados con éxito:", len(prods))
except Exception as e:
    print("ERROR AL CONSULTAR:", type(e), e)
    traceback.print_exc()
finally:
    db.close()
