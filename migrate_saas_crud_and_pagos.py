"""Migración para CRUD de Empresas y Gestión de Pagos:
  1) Agrega 'fecha_inicio' y 'fecha_vencimiento' a 'empresa'.
  2) Crea la tabla 'saas_pago' si no existe.
  3) Rellena fechas por defecto para empresas existentes que tengan nulos.

Es idempotente y seguro de ejecutar múltiples veces.
"""
import datetime
import sqlite3
from app.core.config import settings

DB_PATH = settings.DATABASE_URL.replace("sqlite:///", "")


def columna_existe(cur: sqlite3.Cursor, tabla: str, columna: str) -> bool:
    cur.execute(f"PRAGMA table_info({tabla})")
    return any(fila[1] == columna for fila in cur.fetchall())


def tabla_existe(cur: sqlite3.Cursor, tabla: str) -> bool:
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (tabla,))
    return cur.fetchone() is not None


def main() -> None:
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()

    # 1. Columnas fecha_inicio y fecha_vencimiento en 'empresa'
    if not columna_existe(cur, "empresa", "fecha_inicio"):
        print("Agregando columna 'fecha_inicio' a 'empresa'...")
        cur.execute("ALTER TABLE empresa ADD COLUMN fecha_inicio VARCHAR(10)")
    else:
        print("La columna 'empresa.fecha_inicio' ya existe.")

    if not columna_existe(cur, "empresa", "fecha_vencimiento"):
        print("Agregando columna 'fecha_vencimiento' a 'empresa'...")
        cur.execute("ALTER TABLE empresa ADD COLUMN fecha_vencimiento VARCHAR(10)")
    else:
        print("La columna 'empresa.fecha_vencimiento' ya existe.")

    # 2. Crear tabla saas_pago
    if not tabla_existe(cur, "saas_pago"):
        print("Creando tabla 'saas_pago'...")
        cur.execute(
            """
            CREATE TABLE saas_pago (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                empresa_id INTEGER NOT NULL,
                monto FLOAT NOT NULL,
                metodo VARCHAR(50) NOT NULL,
                referencia VARCHAR(50) NOT NULL,
                comprobante VARCHAR(255),
                fecha VARCHAR(10) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (empresa_id) REFERENCES empresa (id) ON DELETE CASCADE
            )
            """
        )
    else:
        print("La tabla 'saas_pago' ya existe.")

    # 3. Rellenar fechas por defecto para empresas existentes
    hoy_str = datetime.date.today().strftime("%Y-%m-%d")
    vence_str = (datetime.date.today() + datetime.timedelta(days=30)).strftime("%Y-%m-%d")
    
    cur.execute("SELECT id FROM empresa WHERE fecha_inicio IS NULL OR fecha_vencimiento IS NULL")
    empresas_sin_fechas = cur.fetchall()
    
    if empresas_sin_fechas:
        print(f"Rellenando fechas para {len(empresas_sin_fechas)} empresas...")
        for (emp_id,) in empresas_sin_fechas:
            cur.execute(
                "UPDATE empresa SET fecha_inicio = ?, fecha_vencimiento = ? WHERE id = ?",
                (hoy_str, vence_str, emp_id)
            )
    else:
        print("Todas las empresas ya tienen fechas establecidas.")

    con.commit()
    con.close()
    print("Migración de Pagos y Suscripciones completada con éxito.")


if __name__ == "__main__":
    main()
