"""Migración para el Control de Turnos y Arqueo de Caja:
  1) Crea la tabla 'turnocaja' (tabla nueva, vía create_all).
  2) Agrega las columnas 'turno_id' y 'metodo_pago' a la tabla 'ticket' existente.
Idempotente."""
import sqlite3

from app.db.session import engine
from app.models.base import Base
from app.models.empresa import Empresa
from app.models.usuario import Usuario
from app.models.ticket import Ticket
from app.models.turno_caja import TurnoCaja
from app.core.config import settings

DB_PATH = settings.DATABASE_URL.replace("sqlite:///", "")


def columna_existe(cur: sqlite3.Cursor, tabla: str, columna: str) -> bool:
    cur.execute(f"PRAGMA table_info({tabla})")
    return any(fila[1] == columna for fila in cur.fetchall())


def main() -> None:
    print("Creando tabla 'turnocaja' si no existe...")
    Base.metadata.create_all(bind=engine, tables=[TurnoCaja.__table__])

    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()

    if not columna_existe(cur, "ticket", "turno_id"):
        print("Agregando columna 'turno_id' a 'ticket'...")
        cur.execute("ALTER TABLE ticket ADD COLUMN turno_id INTEGER")
    else:
        print("La columna 'turno_id' ya existe.")

    if not columna_existe(cur, "ticket", "metodo_pago"):
        print("Agregando columna 'metodo_pago' a 'ticket'...")
        cur.execute("ALTER TABLE ticket ADD COLUMN metodo_pago VARCHAR(30)")
    else:
        print("La columna 'metodo_pago' ya existe.")

    con.commit()
    con.close()
    print("Migración completada con éxito.")


if __name__ == "__main__":
    main()
