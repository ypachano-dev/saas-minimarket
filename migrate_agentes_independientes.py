"""Migración ligera (sin Alembic): agrega las columnas de activación
independiente de cada guía de IA (agente_vale_activo, agente_yhorge_activo,
agente_alo_activo) a la tabla 'empresa', con default True para no desactivar
guías de empresas ya existentes. Idempotente."""
import sqlite3
from app.core.config import settings

DB_PATH = settings.DATABASE_URL.replace("sqlite:///", "")
COLUMNAS = ["agente_vale_activo", "agente_yhorge_activo", "agente_alo_activo"]


def columna_existe(cur: sqlite3.Cursor, tabla: str, columna: str) -> bool:
    cur.execute(f"PRAGMA table_info({tabla})")
    return any(fila[1] == columna for fila in cur.fetchall())


def main() -> None:
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()

    for columna in COLUMNAS:
        if not columna_existe(cur, "empresa", columna):
            print(f"Agregando columna '{columna}' a 'empresa' (default 1/activo)...")
            cur.execute(f"ALTER TABLE empresa ADD COLUMN {columna} BOOLEAN DEFAULT 1 NOT NULL")
        else:
            print(f"La columna '{columna}' ya existe.")

    con.commit()
    con.close()
    print("Migración completada con éxito.")


if __name__ == "__main__":
    main()
