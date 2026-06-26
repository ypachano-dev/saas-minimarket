"""Migración ligera (sin Alembic): agrega las columnas de la plantilla de
ticket de Caja parametrizable por inquilino a la tabla 'empresa'. Idempotente."""
import sqlite3
from app.core.config import settings

DB_PATH = settings.DATABASE_URL.replace("sqlite:///", "")

COLUMNAS_BOOL_DEFAULT_TRUE = ["ticket_mostrar_logo", "ticket_mostrar_rif"]
COLUMNAS_BOOL_DEFAULT_FALSE = ["ticket_desglosar_impuestos"]
COLUMNAS_TEXTO = ["ticket_texto_cabecera", "ticket_texto_pie"]


def columna_existe(cur: sqlite3.Cursor, tabla: str, columna: str) -> bool:
    cur.execute(f"PRAGMA table_info({tabla})")
    return any(fila[1] == columna for fila in cur.fetchall())


def main() -> None:
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()

    if not columna_existe(cur, "empresa", "ticket_tamano_papel"):
        print("Agregando columna 'ticket_tamano_papel' (default '80mm')...")
        cur.execute("ALTER TABLE empresa ADD COLUMN ticket_tamano_papel VARCHAR(10) DEFAULT '80mm' NOT NULL")
    else:
        print("La columna 'ticket_tamano_papel' ya existe.")

    for columna in COLUMNAS_BOOL_DEFAULT_TRUE:
        if not columna_existe(cur, "empresa", columna):
            print(f"Agregando columna '{columna}' (default 1/activo)...")
            cur.execute(f"ALTER TABLE empresa ADD COLUMN {columna} BOOLEAN DEFAULT 1 NOT NULL")
        else:
            print(f"La columna '{columna}' ya existe.")

    for columna in COLUMNAS_BOOL_DEFAULT_FALSE:
        if not columna_existe(cur, "empresa", columna):
            print(f"Agregando columna '{columna}' (default 0/inactivo)...")
            cur.execute(f"ALTER TABLE empresa ADD COLUMN {columna} BOOLEAN DEFAULT 0 NOT NULL")
        else:
            print(f"La columna '{columna}' ya existe.")

    for columna in COLUMNAS_TEXTO:
        if not columna_existe(cur, "empresa", columna):
            print(f"Agregando columna '{columna}' (texto libre, NULL permitido)...")
            cur.execute(f"ALTER TABLE empresa ADD COLUMN {columna} TEXT")
        else:
            print(f"La columna '{columna}' ya existe.")

    con.commit()
    con.close()
    print("Migración completada con éxito.")


if __name__ == "__main__":
    main()
