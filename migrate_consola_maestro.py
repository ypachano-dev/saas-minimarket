"""Migración ligera (sin Alembic) para identidad clara + catálogo de planes:
  1) Agrega 'telefono' a 'usuario'.
  2) Agrega 'plan_id', 'sitio_web', 'instagram', 'facebook', 'whatsapp',
     'tiktok', 'x', 'modulos_override' a 'empresa'.
  3) Crea la tabla 'plan' si no existe.
  4) Siembra los 3 planes (Básico/Pro/Max) si la tabla 'plan' está vacía.

Es idempotente: se puede ejecutar varias veces sin romper nada.
"""
import json
import sqlite3
from app.core.config import settings

DB_PATH = settings.DATABASE_URL.replace("sqlite:///", "")


def columna_existe(cur: sqlite3.Cursor, tabla: str, columna: str) -> bool:
    cur.execute(f"PRAGMA table_info({tabla})")
    return any(fila[1] == columna for fila in cur.fetchall())


def tabla_existe(cur: sqlite3.Cursor, tabla: str) -> bool:
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (tabla,))
    return cur.fetchone() is not None


PLANES_SEED = [
    {
        "nombre": "Básico",
        "precio_mensual": 29.0,
        "limite_usuarios": 3,
        "modulos": {"dashboard": True, "ingreso": True, "pos": True},
        "agente_vale_incluido": False,
        "agente_yhorge_incluido": False,
        "agente_alo_incluido": False,
    },
    {
        "nombre": "Pro",
        "precio_mensual": 79.0,
        "limite_usuarios": 10,
        "modulos": {
            "dashboard": True, "ingreso": True, "pos": True,
            "pedidos": True, "delivery": True, "ficha": True,
        },
        "agente_vale_incluido": False,
        "agente_yhorge_incluido": False,
        "agente_alo_incluido": True,
    },
    {
        "nombre": "Max",
        "precio_mensual": 149.0,
        "limite_usuarios": 25,
        "modulos": {
            "dashboard": True, "ingreso": True, "pos": True, "pedidos": True,
            "delivery": True, "crm": True, "estadisticas": True,
            "almacen": True, "tesoreria": True, "ficha": True,
        },
        "agente_vale_incluido": True,
        "agente_yhorge_incluido": True,
        "agente_alo_incluido": True,
    },
]


def main() -> None:
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()

    if not columna_existe(cur, "usuario", "telefono"):
        print("Agregando columna 'telefono' a 'usuario'...")
        cur.execute("ALTER TABLE usuario ADD COLUMN telefono VARCHAR(20)")
    else:
        print("La columna 'usuario.telefono' ya existe.")

    columnas_empresa = [
        ("plan_id", "INTEGER"),
        ("sitio_web", "VARCHAR(255)"),
        ("instagram", "VARCHAR(100)"),
        ("facebook", "VARCHAR(100)"),
        ("whatsapp", "VARCHAR(20)"),
        ("tiktok", "VARCHAR(100)"),
        ("x", "VARCHAR(100)"),
        ("modulos_override", "JSON"),
    ]
    for nombre_columna, tipo_sql in columnas_empresa:
        if not columna_existe(cur, "empresa", nombre_columna):
            print(f"Agregando columna 'empresa.{nombre_columna}'...")
            cur.execute(f"ALTER TABLE empresa ADD COLUMN {nombre_columna} {tipo_sql}")
        else:
            print(f"La columna 'empresa.{nombre_columna}' ya existe.")

    if not tabla_existe(cur, "plan"):
        print("Creando tabla 'plan'...")
        cur.execute(
            """
            CREATE TABLE plan (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre VARCHAR(30) NOT NULL UNIQUE,
                precio_mensual FLOAT NOT NULL,
                limite_usuarios INTEGER NOT NULL,
                modulos JSON NOT NULL,
                agente_vale_incluido BOOLEAN NOT NULL DEFAULT 0,
                agente_yhorge_incluido BOOLEAN NOT NULL DEFAULT 0,
                agente_alo_incluido BOOLEAN NOT NULL DEFAULT 0
            )
            """
        )
    else:
        print("La tabla 'plan' ya existe.")

    cur.execute("SELECT COUNT(*) FROM plan")
    if cur.fetchone()[0] == 0:
        print("Sembrando los 3 planes (Básico/Pro/Max)...")
        for plan in PLANES_SEED:
            cur.execute(
                """
                INSERT INTO plan
                    (nombre, precio_mensual, limite_usuarios, modulos,
                     agente_vale_incluido, agente_yhorge_incluido, agente_alo_incluido)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    plan["nombre"],
                    plan["precio_mensual"],
                    plan["limite_usuarios"],
                    json.dumps(plan["modulos"]),
                    plan["agente_vale_incluido"],
                    plan["agente_yhorge_incluido"],
                    plan["agente_alo_incluido"],
                ),
            )
    else:
        print("La tabla 'plan' ya tiene filas; no se vuelve a sembrar.")

    con.commit()
    con.close()
    print("Migración completada con éxito.")


if __name__ == "__main__":
    main()
