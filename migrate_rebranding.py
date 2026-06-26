"""Migración ligera (sin Alembic) para la reestructuración multi-negocio:
  1) Agrega la columna 'nombre_corto' a la tabla 'empresa' si no existe.
  2) Normaliza el valor heredado 'agroferreteria' -> 'ferreagropecuaria'
     (nuevo Enum estricto TipoNegocio en app/core/negocio_config.py).
  3) Rellena 'nombre_corto' para empresas que no lo tengan, a partir de
     la primera palabra de su nombre_comercial.

Es idempotente: se puede ejecutar varias veces sin romper nada.
"""
import sqlite3
from app.core.config import settings

DB_PATH = settings.DATABASE_URL.replace("sqlite:///", "")


def columna_existe(cur: sqlite3.Cursor, tabla: str, columna: str) -> bool:
    cur.execute(f"PRAGMA table_info({tabla})")
    return any(fila[1] == columna for fila in cur.fetchall())


def main() -> None:
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()

    if not columna_existe(cur, "empresa", "nombre_corto"):
        print("Agregando columna 'nombre_corto' a 'empresa'...")
        cur.execute("ALTER TABLE empresa ADD COLUMN nombre_corto VARCHAR(30)")
    else:
        print("La columna 'nombre_corto' ya existe.")

    print("Normalizando valores heredados de 'tipo_negocio' (agroferreteria -> ferreagropecuaria)...")
    cur.execute("UPDATE empresa SET tipo_negocio = 'ferreagropecuaria' WHERE tipo_negocio = 'agroferreteria'")
    print(f"  Filas actualizadas: {cur.rowcount}")

    print("Rellenando 'nombre_corto' vacíos a partir de 'nombre_comercial'...")
    cur.execute("SELECT id, nombre_comercial FROM empresa WHERE nombre_corto IS NULL OR nombre_corto = ''")
    pendientes = cur.fetchall()
    for empresa_id, nombre_comercial in pendientes:
        corto = (nombre_comercial or "Empresa").split(" ")[0][:30]
        cur.execute("UPDATE empresa SET nombre_corto = ? WHERE id = ?", (corto, empresa_id))
    print(f"  Empresas actualizadas: {len(pendientes)}")

    con.commit()
    con.close()
    print("Migración completada con éxito.")


if __name__ == "__main__":
    main()
