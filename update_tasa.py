from decimal import Decimal
from app.db.session import SessionLocal
from app.models.empresa import Empresa
from app.models.tasa import TasaCambio

EID = 1
db = SessionLocal()

tasa = db.query(TasaCambio).filter(TasaCambio.empresa_id == EID).first()
tasa.valor_bcv = Decimal("587.41")
db.commit()
print(f"OK: tasa_bcv actualizada a {tasa.valor_bcv} para empresa_id={EID}.")
db.close()
