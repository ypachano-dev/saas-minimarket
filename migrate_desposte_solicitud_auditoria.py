"""Migración: agrega columnas de auditoría a 'desposte_solicitud' para registrar quién
editó o eliminó una solicitud pendiente (no necesariamente quien la creó, ya que cualquier
usuario del mismo grupo Caja/Balanza, o admin/propietario, puede gestionarla). Idempotente."""
import sqlite3

from app.core.config import settings

DB_PATH = settings.DATABASE_URL.replace("sqlite:///", "")


def columna_existe(cur: sqlite3.Cursor, tabla: str, columna: str) -> bool:
    cur.execute(f"PRAGMA table_info({tabla})")
    return any(fila[1] == columna for fila in cur.fetchall())


def main() -> None:
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()

    for columna, ddl in [
        ("cancelado_por_id", "ALTER TABLE desposte_solicitud ADD COLUMN cancelado_por_id INTEGER"),
        ("editado_por_id", "ALTER TABLE desposte_solicitud ADD COLUMN editado_por_id INTEGER"),
        ("editado_en", "ALTER TABLE desposte_solicitud ADD COLUMN editado_en DATETIME"),
    ]:
        if not columna_existe(cur, "desposte_solicitud", columna):
            print(f"Agregando columna '{columna}' a 'desposte_solicitud'...")
            cur.execute(ddl)
        else:
            print(f"La columna '{columna}' ya existe.")

    con.commit()
    con.close()
    print("Migración completada con éxito.")


if __name__ == "__main__":
    main()
