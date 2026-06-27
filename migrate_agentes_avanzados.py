"""Migración ligera (sin Alembic): agrega las columnas de la configuración
avanzada de agentes de IA a la tabla 'empresa'. Idempotente."""
import sqlite3
from app.core.config import settings

DB_PATH = settings.DATABASE_URL.replace("sqlite:///", "")

# Nuevas columnas
COLUMNAS_TEXTO = ["agente_vale_prompt", "agente_yhorge_prompt", "agente_alo_prompt"]
COLUMNAS_VARCHAR = ["agente_vale_modelo", "agente_yhorge_modelo", "agente_alo_modelo"]
COLUMNAS_FLOAT = ["agente_vale_temperatura", "agente_yhorge_temperatura", "agente_alo_temperatura"]


def columna_existe(cur: sqlite3.Cursor, tabla: str, columna: str) -> bool:
    cur.execute(f"PRAGMA table_info({tabla})")
    return any(fila[1] == columna for fila in cur.fetchall())


def main() -> None:
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()

    for columna in COLUMNAS_TEXTO:
        if not columna_existe(cur, "empresa", columna):
            print(f"Agregando columna '{columna}' (TEXT, NULL permitido)...")
            cur.execute(f"ALTER TABLE empresa ADD COLUMN {columna} TEXT")
        else:
            print(f"La columna '{columna}' ya existe.")

    for columna in COLUMNAS_VARCHAR:
        if not columna_existe(cur, "empresa", columna):
            print(f"Agregando columna '{columna}' (VARCHAR(50), NULL permitido)...")
            cur.execute(f"ALTER TABLE empresa ADD COLUMN {columna} VARCHAR(50)")
        else:
            print(f"La columna '{columna}' ya existe.")

    for columna in COLUMNAS_FLOAT:
        if not columna_existe(cur, "empresa", columna):
            print(f"Agregando columna '{columna}' (FLOAT, NULL permitido)...")
            cur.execute(f"ALTER TABLE empresa ADD COLUMN {columna} FLOAT")
        else:
            print(f"La columna '{columna}' ya existe.")

    con.commit()
    con.close()
    print("Migración de agentes avanzados completada con éxito.")


if __name__ == "__main__":
    main()
