# Consola Maestro: Identidad + Catálogo de Planes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the confusing, partly-decorative "Consola SaaS Maestro" identity/plan flow with a clear owner-vs-company data model and a real, editable Plan catalog (Básico/Pro/Max) that actually controls what modules/agents a tenant gets.

**Architecture:** Backend gets a new `Plan` table plus new columns on `Usuario` (telefono) and `Empresa` (plan_id, social/web fields, modulos_override) via a raw-sqlite idempotent migration script (matching this repo's existing `migrate_*.py` convention — no Alembic). Two new endpoints (`GET`/`PUT /api/v1/planes`) expose the catalog. `registrar-saas` is updated to persist the new fields and a shared helper fixes `modulos_habilitados` to merge `tipo_negocio`'s base list with the per-empresa override. On the frontend, `ModuloEmpresas.tsx` is reorganized into clearer sections and a shared `MatrizModulosAgentes` component is extracted so the new `CatalogoPlanes` screen and the existing "Alta de Empresa" form render the same toggle grid without duplicating it.

**Tech Stack:** FastAPI + SQLAlchemy + raw `sqlite3` migrations (Python backend, `app/`), React + TypeScript + Tailwind + axios (`frontend/`).

## Global Constraints

- No Alembic — migrations in this repo are idempotent raw-`sqlite3` scripts at the repo root (pattern: `migrate_rebranding.py`).
- No automated test framework exists in this repo (confirmed: no `tests/` directory, no `pytest`/`vitest` config). Verification means: running the backend (`uvicorn app.main:app --host 0.0.0.0 --port 8000`, **no** `--reload` — this project's dev convention) and the frontend (`npm run dev` in `frontend/`), then `curl`/browser checks against real endpoints, plus `npm run build` passing with zero TypeScript errors.
- Backend login is always by email (`POST /api/v1/auth/login` with `{email, password}` JSON body, not OAuth2 form data). There is no `username` column on `Usuario` — `username_admin` is removed from `RegistroEmpresaAdmin`, not kept for backwards compatibility.
- The "Consola SaaS Maestro" screen stays gated to `rol === "propietario"` exactly as today (`frontend/src/components/Sidebar.tsx:63`, `frontend/src/App.tsx:80`) — this plan does not change that gate.
- `modulos_habilitados` (in `EmpresaConfigResponse`) must become the union/override of `NEGOCIO_CONFIG[tipo_negocio]["modulos_base"]` and `Empresa.modulos_override` (a `{"modulo_key": bool}` dict) — `True` in the override adds a module even if `tipo_negocio` excludes it; `False` removes one even if `tipo_negocio` includes it; a key absent from the override defers to `modulos_base`.
- Plan catalog seed values (editable afterwards, not contractual): Básico $29/mes, 3 usuarios, módulos `dashboard,ingreso,pos`, sin agentes. Pro $79/mes, 10 usuarios, módulos `dashboard,ingreso,pos,pedidos,delivery,ficha`, agente ALO incluido. Max $149/mes, 25 usuarios, todos los módulos de `MODULOS_ERP`, los 3 agentes incluidos.
- Out of scope for this plan (separate sub-projects, do not build): logo file upload (stays a URL field), editing an already-created empresa's data, and the payments/receipt-approval module.

---

### Task 1: Backend models — `Plan` table, `Usuario.telefono`, `Empresa` new columns

**Files:**
- Create: `app/models/plan.py`
- Modify: `app/models/usuario.py`
- Modify: `app/models/empresa.py`
- Modify: `create_tables.py`

**Interfaces:**
- Produces: `class Plan(Base)` with columns `id: int`, `nombre: str`, `precio_mensual: float`, `limite_usuarios: int`, `modulos: dict`, `agente_vale_incluido: bool`, `agente_yhorge_incluido: bool`, `agente_alo_incluido: bool` — consumed by Task 3 (schemas), Task 4 (endpoints), and the migration script in Task 2.
- Produces: `Usuario.telefono: str | None` — consumed by Task 4 (registrar-saas handler).
- Produces: `Empresa.plan_id`, `Empresa.sitio_web`, `Empresa.instagram`, `Empresa.facebook`, `Empresa.whatsapp`, `Empresa.tiktok`, `Empresa.x`, `Empresa.modulos_override: dict | None` — consumed by Task 4.

- [ ] **Step 1: Create the `Plan` model**

Create `app/models/plan.py`:

```python
from sqlalchemy import String, Boolean, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class Plan(Base):
    """Catálogo editable de planes de suscripción (Básico/Pro/Max).

    'modulos' guarda un dict {"clave_modulo": bool} con las mismas claves que
    MODULOS_ERP en el frontend (dashboard, ingreso, pos, pedidos, delivery,
    crm, estadisticas, almacen, tesoreria, ficha). Se usa para precargar
    Empresa.modulos_override cuando se elige este plan al crear una empresa.
    """
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    precio_mensual: Mapped[float] = mapped_column(nullable=False)
    limite_usuarios: Mapped[int] = mapped_column(nullable=False)
    modulos: Mapped[dict] = mapped_column(JSON, nullable=False)
    agente_vale_incluido: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    agente_yhorge_incluido: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    agente_alo_incluido: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
```

- [ ] **Step 2: Add `telefono` to `Usuario`**

Modify `app/models/usuario.py` — add this line right after `email`'s column definition (after line 13, before `password_hash`):

```python
    email: Mapped[str] = mapped_column(String(100), nullable=False)
    telefono: Mapped[str | None] = mapped_column(String(20), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
```

- [ ] **Step 3: Add new columns to `Empresa`**

Modify `app/models/empresa.py`. First, update the import line at the top from:

```python
from sqlalchemy import String, Text, DateTime, Boolean, Enum as SAEnum, func
```

to:

```python
from sqlalchemy import String, Text, DateTime, Boolean, Enum as SAEnum, func, JSON, ForeignKey
```

Then add these columns right after the existing `logo_url` line (`logo_url: Mapped[str | None] = mapped_column(String(255), nullable=True)`):

```python
    logo_url: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Plan de suscripción asignado (catálogo editable en la tabla 'plan')
    plan_id: Mapped[int | None] = mapped_column(ForeignKey("plan.id"), nullable=True)

    # Presencia digital del cliente, mostrada en su propio sitio/landing si aplica
    sitio_web: Mapped[str | None] = mapped_column(String(255), nullable=True)
    instagram: Mapped[str | None] = mapped_column(String(100), nullable=True)
    facebook: Mapped[str | None] = mapped_column(String(100), nullable=True)
    whatsapp: Mapped[str | None] = mapped_column(String(20), nullable=True)
    tiktok: Mapped[str | None] = mapped_column(String(100), nullable=True)
    x: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Ajuste fino de módulos por empresa, por encima de los módulos base de
    # tipo_negocio. Dict {"clave_modulo": bool}; una clave ausente significa
    # "usar lo que diga tipo_negocio". Ver calcular_modulos_habilitados en app/main.py.
    modulos_override: Mapped[dict | None] = mapped_column(JSON, nullable=True)
```

- [ ] **Step 4: Register the new model in `create_tables.py`**

Modify `create_tables.py` — add this import line in the model-imports block (right after `from app.models.usuario import Usuario`):

```python
from app.models.plan import Plan
```

- [ ] **Step 5: Verify the models import cleanly**

```bash
cd "e:/PROYECTOS_IA/SaaS MiniMarket"
"venv/Scripts/python.exe" -c "from app.models.plan import Plan; from app.models.empresa import Empresa; from app.models.usuario import Usuario; print('plan_id' in Empresa.__table__.columns.keys()); print('telefono' in Usuario.__table__.columns.keys()); print(sorted(Plan.__table__.columns.keys()))"
```

Expected output (3 lines):
```
True
True
['agente_alo_incluido', 'agente_vale_incluido', 'agente_yhorge_incluido', 'id', 'limite_usuarios', 'modulos', 'nombre', 'precio_mensual']
```

- [ ] **Step 6: Commit**

```bash
cd "e:/PROYECTOS_IA/SaaS MiniMarket"
git add app/models/plan.py app/models/usuario.py app/models/empresa.py create_tables.py
git commit -m "feat: add Plan model, Usuario.telefono, and Empresa social/plan columns"
```

---

### Task 2: Idempotent migration script for the real SQLite database

**Files:**
- Create: `migrate_consola_maestro.py`

**Interfaces:**
- Consumes: `app.core.config.settings.DATABASE_URL` (same pattern as `migrate_rebranding.py`).
- Produces: the `plan` table with 3 seeded rows, plus the new columns on `usuario` and `empresa` in the real `saas_minimarket.db` file — consumed by Task 4's endpoints once the server runs against this database.

- [ ] **Step 1: Write the migration script**

Create `migrate_consola_maestro.py`:

```python
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
```

- [ ] **Step 2: Run the migration against the real database**

```bash
cd "e:/PROYECTOS_IA/SaaS MiniMarket"
"venv/Scripts/python.exe" migrate_consola_maestro.py
```

Expected: prints each column/table being added (first run) and the 3 plans being seeded, ending with "Migración completada con éxito."

- [ ] **Step 3: Verify idempotency and seeded data**

```bash
cd "e:/PROYECTOS_IA/SaaS MiniMarket"
"venv/Scripts/python.exe" migrate_consola_maestro.py
"venv/Scripts/python.exe" -c "
import sqlite3
con = sqlite3.connect('saas_minimarket.db')
cur = con.cursor()
cur.execute('SELECT nombre, precio_mensual, limite_usuarios FROM plan ORDER BY precio_mensual')
print(cur.fetchall())
"
```

Expected: the second run prints "ya existe"/"ya tiene filas" for everything (no errors), and the query prints:
```
[('Básico', 29.0, 3), ('Pro', 79.0, 10), ('Max', 149.0, 25)]
```

- [ ] **Step 4: Commit**

```bash
cd "e:/PROYECTOS_IA/SaaS MiniMarket"
git add migrate_consola_maestro.py
git commit -m "feat: migrate real db with Plan table seed and new usuario/empresa columns"
```

---

### Task 3: Backend schemas — `PlanResponse`, `PlanUpdate`, updated `RegistroEmpresaAdmin`

**Files:**
- Modify: `app/schemas.py`

**Interfaces:**
- Produces: `class PlanResponse(BaseModel)` and `class PlanUpdate(BaseModel)` — consumed by Task 4's endpoints.
- Produces: updated `RegistroEmpresaAdmin` (new optional fields, `username_admin` removed) — consumed by Task 4's `registrar_empresa_y_admin` handler and by Task 7's frontend payload.

- [ ] **Step 1: Update `RegistroEmpresaAdmin`**

In `app/schemas.py`, replace the full `RegistroEmpresaAdmin` class (currently lines 10-33) with:

```python
class RegistroEmpresaAdmin(BaseModel):
    # Datos de la Empresa
    nombre_empresa: str
    rif_or_cedula: str
    telefono: Optional[str] = None
    direccion: Optional[str] = None
    tipo_negocio: Optional[TipoNegocio] = TipoNegocio.MINIMARKET
    plan_id: Optional[int] = None
    sitio_web: Optional[str] = None
    instagram: Optional[str] = None
    facebook: Optional[str] = None
    whatsapp: Optional[str] = None
    tiktok: Optional[str] = None
    x: Optional[str] = None
    modulos_override: Optional[dict] = None

    # Branding del inquilino (nombre corto, logo y paleta de colores)
    nombre_corto: Optional[str] = None
    logo_url: Optional[str] = None
    color_primario: Optional[str] = None
    color_secundario: Optional[str] = None

    # Activación independiente de cada guía de IA para este inquilino
    agente_vale_activo: bool = True
    agente_yhorge_activo: bool = True
    agente_alo_activo: bool = True

    # Datos del Dueño (también su identidad de acceso: inicia sesión con email_admin)
    nombre_admin: str
    email_admin: str
    telefono_admin: Optional[str] = None
    password_admin: str
```

- [ ] **Step 2: Add `Dict` to the typing import**

In `app/schemas.py`, change the typing import line from:

```python
from typing import List, Optional
```

to:

```python
from typing import Dict, List, Optional
```

- [ ] **Step 3: Add `PlanResponse` and `PlanUpdate`**

In `app/schemas.py`, add these classes right after the `RegistroEmpresaAdmin` class:

```python
# Molde de salida para un plan del catálogo (Básico/Pro/Max)
class PlanResponse(BaseModel):
    id: int
    nombre: str
    precio_mensual: float
    limite_usuarios: int
    modulos: Dict[str, bool]
    agente_vale_incluido: bool
    agente_yhorge_incluido: bool
    agente_alo_incluido: bool

# Molde de entrada para editar un plan existente
class PlanUpdate(BaseModel):
    precio_mensual: float
    limite_usuarios: int
    modulos: Dict[str, bool]
    agente_vale_incluido: bool
    agente_yhorge_incluido: bool
    agente_alo_incluido: bool
```

- [ ] **Step 4: Verify the schemas import cleanly**

```bash
cd "e:/PROYECTOS_IA/SaaS MiniMarket"
"venv/Scripts/python.exe" -c "from app.schemas import RegistroEmpresaAdmin, PlanResponse, PlanUpdate; print('ok'); print('username_admin' in RegistroEmpresaAdmin.model_fields)"
```

Expected:
```
ok
False
```

- [ ] **Step 5: Commit**

```bash
cd "e:/PROYECTOS_IA/SaaS MiniMarket"
git add app/schemas.py
git commit -m "feat: add PlanResponse/PlanUpdate schemas, update RegistroEmpresaAdmin fields"
```

---

### Task 4: Backend endpoints — Plan catalog, fixed `registrar-saas`, real `modulos_habilitados`

**Files:**
- Modify: `app/main.py`

**Interfaces:**
- Consumes: `Plan` (Task 1), `PlanResponse`/`PlanUpdate`/`RegistroEmpresaAdmin` (Task 3).
- Produces: `GET /api/v1/planes` (returns `List[PlanResponse]`), `PUT /api/v1/planes/{plan_id}` (returns `PlanResponse`) — consumed by Task 6's frontend `CatalogoPlanes` component and Task 7's plan-select prefill logic.
- Produces: `def calcular_modulos_habilitados(modulos_base: list[str], modulos_override: dict | None) -> list[str]` — a private helper in `app/main.py`, used internally by the two existing `EmpresaConfigResponse`-building code paths.

- [ ] **Step 1: Import `Plan` and the new schemas in `app/main.py`**

Add this import line right after `from app.models.usuario import Usuario`:

```python
from app.models.plan import Plan
```

Add `PlanResponse, PlanUpdate` to the existing `from app.schemas import (...)` block (insert right after the `RegistroEmpresaAdmin, LoginRequest, Token, TokenData,` line):

```python
from app.schemas import (
    RegistroEmpresaAdmin, LoginRequest, Token, TokenData, PlanResponse, PlanUpdate,
    EmpresaConfigResponse, NomenclaturaNegocioResponse, TicketConfigResponse, TicketConfigUpdate, AgentesIAUpdate,
```

(keep the rest of that multi-line import exactly as-is below this point).

- [ ] **Step 2: Add the `calcular_modulos_habilitados` helper**

Add this function in `app/main.py` right before the `obtener_mi_config_empresa` endpoint definition (right before the line `@app.get("/api/v1/empresa/mi-config", ...)`):

```python
def calcular_modulos_habilitados(modulos_base: list[str], modulos_override: dict | None) -> list[str]:
    """Combina los módulos base de tipo_negocio con el ajuste fino por
    empresa (Empresa.modulos_override). Una clave True en el override agrega
    el módulo aunque tipo_negocio no lo traiga; False lo quita aunque
    tipo_negocio lo traiga; una clave ausente respeta tipo_negocio."""
    if not modulos_override:
        return modulos_base
    resultado = set(modulos_base)
    for clave, incluido in modulos_override.items():
        if incluido:
            resultado.add(clave)
        else:
            resultado.discard(clave)
    return sorted(resultado)
```

- [ ] **Step 3: Use the helper in both `EmpresaConfigResponse` builders**

In `app/main.py`, there are exactly two occurrences of this line:

```python
        modulos_habilitados=config["modulos_base"],
```

Replace **both** with:

```python
        modulos_habilitados=calcular_modulos_habilitados(config["modulos_base"], empresa.modulos_override),
```

(One is inside `obtener_mi_config_empresa`, the other inside the agentes-IA update endpoint a bit further down — both build `EmpresaConfigResponse` from an `empresa` variable already in scope, so this is a direct substitution in each spot.)

- [ ] **Step 4: Add the Plan catalog endpoints**

Add these two endpoints in `app/main.py` right after the `registrar_empresa_y_admin` function (after its closing `except` block, before the `# ==== MÓDULO FUERZA DE VENTAS ====` comment block):

```python
# 3. Catálogo de Planes de Suscripción (Básico / Pro / Max)
@app.get("/api/v1/planes", tags=["Planes"], response_model=list[PlanResponse])
def listar_planes(
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(get_current_user),
):
    return db.query(Plan).order_by(Plan.precio_mensual).all()


@app.put("/api/v1/planes/{plan_id}", tags=["Planes"], response_model=PlanResponse)
def actualizar_plan(
    plan_id: int,
    datos: PlanUpdate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(["propietario"])),
):
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan no encontrado.")

    plan.precio_mensual = datos.precio_mensual
    plan.limite_usuarios = datos.limite_usuarios
    plan.modulos = datos.modulos
    plan.agente_vale_incluido = datos.agente_vale_incluido
    plan.agente_yhorge_incluido = datos.agente_yhorge_incluido
    plan.agente_alo_incluido = datos.agente_alo_incluido

    try:
        db.commit()
        db.refresh(plan)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No se pudo guardar el plan.")
    return plan
```

- [ ] **Step 5: Update `registrar_empresa_y_admin` to persist the new fields**

In `app/main.py`, inside `registrar_empresa_y_admin`, replace the `nueva_empresa = Empresa(...)` block with:

```python
        nueva_empresa = Empresa(
            nombre_comercial=datos.nombre_empresa,
            nombre_corto=datos.nombre_corto or datos.nombre_empresa.split(" ")[0][:30],
            rif=datos.rif_or_cedula,
            telefono=datos.telefono,
            direccion=datos.direccion,
            tipo_negocio=datos.tipo_negocio or TipoNegocio.MINIMARKET,
            logo_url=datos.logo_url,
            color_primario=datos.color_primario or "#00ebc7",
            color_secundario=datos.color_secundario or "#111936",
            agente_vale_activo=datos.agente_vale_activo,
            agente_yhorge_activo=datos.agente_yhorge_activo,
            agente_alo_activo=datos.agente_alo_activo,
            plan_id=datos.plan_id,
            sitio_web=datos.sitio_web,
            instagram=datos.instagram,
            facebook=datos.facebook,
            whatsapp=datos.whatsapp,
            tiktok=datos.tiktok,
            x=datos.x,
            modulos_override=datos.modulos_override,
            status="activo"
        )
```

And replace the `nuevo_usuario = Usuario(...)` block with:

```python
        nuevo_usuario = Usuario(
            empresa_id=nueva_empresa.id,
            nombre=datos.nombre_admin,             # Ajustado a tu columna 'nombre'
            email=datos.email_admin,
            telefono=datos.telefono_admin,
            password_hash=generar_hash_password(datos.password_admin[:72]),   # ¡AHORA SÍ, ENCRIPTADO SEGURO!
            rol="propietario",  # Dueño del negocio: acceso total bajo el esquema RBAC (admin/propietario)
            status=True                           # Ajustado a tu columna 'status' tipo Boolean
        )
```

- [ ] **Step 6: Start the backend and verify the new endpoints**

```bash
cd "e:/PROYECTOS_IA/SaaS MiniMarket"
"venv/Scripts/python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 > backend_run.log 2>&1 &
sleep 3
curl -s -X POST http://localhost:8000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"ypachano@gmail.com","password":"Minimarket2026"}'
```

Expected: a JSON response with `access_token`. Save that token, then:

```bash
TOKEN="<paste the access_token value here>"
curl -s http://localhost:8000/api/v1/planes -H "Authorization: Bearer $TOKEN"
```

Expected: a JSON array with 3 plans (Básico/Pro/Max), each with `modulos` as an object and the 3 `agente_*_incluido` booleans.

```bash
curl -s -X PUT http://localhost:8000/api/v1/planes/1 -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"precio_mensual": 35, "limite_usuarios": 3, "modulos": {"dashboard": true, "ingreso": true, "pos": true}, "agente_vale_incluido": false, "agente_yhorge_incluido": false, "agente_alo_incluido": false}'
```

Expected: the response echoes back `"precio_mensual":35.0`. Then:

```bash
curl -s http://localhost:8000/api/v1/empresa/mi-config -H "Authorization: Bearer $TOKEN"
```

Expected: still returns the normal config (this confirms `calcular_modulos_habilitados` didn't break the existing endpoint — `modulos_override` is `None` for this tenant today, so `modulos_habilitados` should be unchanged from before this task).

- [ ] **Step 7: Stop the backend**

```bash
kill %1 2>/dev/null || true
```

- [ ] **Step 8: Commit**

```bash
cd "e:/PROYECTOS_IA/SaaS MiniMarket"
git add app/main.py
git commit -m "feat: add Plan catalog endpoints, fix modulos_habilitados override, persist new registrar-saas fields"
```

---

### Task 5: Frontend — extract the shared `MatrizModulosAgentes` component

**Files:**
- Create: `frontend/src/components/empresas/MatrizModulosAgentes.tsx`
- Modify: `frontend/src/components/ModuloEmpresas.tsx`

**Interfaces:**
- Produces: `export default function MatrizModulosAgentes(props: { modulos: Record<string, boolean>; onToggleModulo: (key: string) => void; agentesIA: Record<AgenteIAKey, boolean>; onToggleAgenteIA: (key: AgenteIAKey) => void })` — consumed by `ModuloEmpresas.tsx` (this task) and by Task 6's `CatalogoPlanes.tsx`.
- Produces: re-exports `MODULOS_ERP`, `AGENTES_IA`, and `type AgenteIAKey` from this new file (moved out of `ModuloEmpresas.tsx`) — consumed by Task 6.

- [ ] **Step 1: Create the shared component, moving `MODULOS_ERP`/`AGENTES_IA` into it**

Create `frontend/src/components/empresas/MatrizModulosAgentes.tsx`:

```tsx
export const MODULOS_ERP = [
  { key: "dashboard", label: "Dashboard Maestro" },
  { key: "ingreso", label: "Ingreso de Datos (Clientes, Productos, Empleados, Usuarios, Vehículos, Proveedores)" },
  { key: "pos", label: "Caja / POS (Punto de Venta con Lector y Control de Pesados)" },
  { key: "pedidos", label: "Pedidos y Proyecciones Automatizadas" },
  { key: "delivery", label: "Delivery Exprés (Logística y Rutas)" },
  { key: "crm", label: "Módulo CRM (Bot de Carne + Libro de Faltantes)" },
  { key: "estadisticas", label: "Estadísticas Avanzadas y Demandas" },
  { key: "almacen", label: "Gestión de Almacén (Inventario/Carga/Descarga)" },
  { key: "tesoreria", label: "Bancos y Tesorería (Flujos de efectivo $, Bs y Bancos)" },
];

export const AGENTES_IA = [
  { key: "vale", label: "Activar Agente VALE (Análisis/BI)" },
  { key: "yhorge", label: "Activar Agente YHORGE (Control/Administración)" },
  { key: "alo", label: "Activar Agente ALO (Ventas/CRM)" },
] as const;

export type AgenteIAKey = typeof AGENTES_IA[number]["key"];

interface MatrizModulosAgentesProps {
  modulos: Record<string, boolean>;
  onToggleModulo: (key: string) => void;
  agentesIA: Record<AgenteIAKey, boolean>;
  onToggleAgenteIA: (key: AgenteIAKey) => void;
}

export default function MatrizModulosAgentes({
  modulos,
  onToggleModulo,
  agentesIA,
  onToggleAgenteIA,
}: MatrizModulosAgentesProps) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">Módulos Autorizados</h3>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {MODULOS_ERP.map((m) => (
            <div key={m.key} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <span className="text-sm font-medium text-slate-700">{m.label}</span>
              <button
                type="button"
                onClick={() => onToggleModulo(m.key)}
                title={`${m.label}: ${modulos[m.key] ? "Activado" : "Desactivado"}`}
                aria-label={`${m.label}: ${modulos[m.key] ? "Activado" : "Desactivado"}`}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300 ${
                  modulos[m.key] ? "bg-emerald-500" : "bg-slate-200"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-300 ${
                    modulos[m.key] ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">Guías de IA Independientes</h3>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {AGENTES_IA.map((a) => (
            <div key={a.key} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <span className="text-sm font-medium text-slate-700">{a.label}</span>
              <button
                type="button"
                onClick={() => onToggleAgenteIA(a.key)}
                title={`${a.label}: ${agentesIA[a.key] ? "Activado" : "Desactivado"}`}
                aria-label={`${a.label}: ${agentesIA[a.key] ? "Activado" : "Desactivado"}`}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300 ${
                  agentesIA[a.key] ? "bg-emerald-500" : "bg-slate-200"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-300 ${
                    agentesIA[a.key] ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Use it from `ModuloEmpresas.tsx`, removing the duplicated definitions and inline JSX**

In `frontend/src/components/ModuloEmpresas.tsx`:

1. Remove the local `const MODULOS_ERP = [...]` array (lines 23-33) and the local `const AGENTES_IA = [...]` + `type AgenteIAKey = ...` (lines 15-21).
2. Add this import near the top, with the other component imports:

```tsx
import MatrizModulosAgentes, { MODULOS_ERP, AGENTES_IA, type AgenteIAKey } from "./empresas/MatrizModulosAgentes";
```

3. Replace the two `<section>` blocks for "Módulos Autorizados" and "Guías de IA Independientes" (the ones containing the `MODULOS_ERP.map(...)` and `AGENTES_IA.map(...)` JSX, currently lines 531-583) with a single call:

```tsx
        <MatrizModulosAgentes
          modulos={modulos}
          onToggleModulo={toggleModulo}
          agentesIA={agentesIA}
          onToggleAgenteIA={toggleAgenteIA}
        />
```

- [ ] **Step 3: Build and verify**

```bash
cd "e:/PROYECTOS_IA/SaaS MiniMarket/frontend"
npm run build
```

Expected: zero TypeScript errors. (`MODULOS_ERP.length` is still used elsewhere in `ModuloEmpresas.tsx` for the "Módulos Activos" table column — the import above keeps that working since `MODULOS_ERP` is re-exported.)

- [ ] **Step 4: Commit**

```bash
cd "e:/PROYECTOS_IA/SaaS MiniMarket"
git add frontend/src/components/empresas/MatrizModulosAgentes.tsx frontend/src/components/ModuloEmpresas.tsx
git commit -m "refactor: extract shared MatrizModulosAgentes component from ModuloEmpresas"
```

---

### Task 6: Frontend — `CatalogoPlanes` screen

**Files:**
- Create: `frontend/src/components/empresas/CatalogoPlanes.tsx`
- Modify: `frontend/src/components/ModuloEmpresas.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/planes`, `PUT /api/v1/planes/{id}` (Task 4); `MatrizModulosAgentes`, `AgenteIAKey` (Task 5).
- Produces: `export default function CatalogoPlanes()` — rendered by `ModuloEmpresas.tsx`; also produces `export interface PlanCatalogo { id: number; nombre: string; precio_mensual: number; limite_usuarios: number; modulos: Record<string, boolean>; agente_vale_incluido: boolean; agente_yhorge_incluido: boolean; agente_alo_incluido: boolean }` — consumed by Task 7 (the plan-select prefill logic in `ModuloEmpresas.tsx` needs this same shape).

- [ ] **Step 1: Write `CatalogoPlanes.tsx`**

Create `frontend/src/components/empresas/CatalogoPlanes.tsx`:

```tsx
import { useEffect, useState } from "react";
import apiClient from "../../api/client";
import MatrizModulosAgentes, { type AgenteIAKey } from "./MatrizModulosAgentes";

export interface PlanCatalogo {
  id: number;
  nombre: string;
  precio_mensual: number;
  limite_usuarios: number;
  modulos: Record<string, boolean>;
  agente_vale_incluido: boolean;
  agente_yhorge_incluido: boolean;
  agente_alo_incluido: boolean;
}

const inputCls = "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const labelCls = "text-xs font-semibold uppercase tracking-wider text-slate-400";

function planAAgentesIA(plan: PlanCatalogo): Record<AgenteIAKey, boolean> {
  return {
    vale: plan.agente_vale_incluido,
    yhorge: plan.agente_yhorge_incluido,
    alo: plan.agente_alo_incluido,
  };
}

interface PlanCardProps {
  plan: PlanCatalogo;
  onGuardado: (plan: PlanCatalogo) => void;
}

function PlanCard({ plan, onGuardado }: PlanCardProps) {
  const [precio, setPrecio] = useState(String(plan.precio_mensual));
  const [limite, setLimite] = useState(String(plan.limite_usuarios));
  const [modulos, setModulos] = useState<Record<string, boolean>>(plan.modulos);
  const [agentesIA, setAgentesIA] = useState<Record<AgenteIAKey, boolean>>(planAAgentesIA(plan));
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  function toggleModulo(key: string) {
    setModulos((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleAgenteIA(key: AgenteIAKey) {
    setAgentesIA((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function guardar() {
    setGuardando(true);
    setMensaje("");
    try {
      const { data } = await apiClient.put(`/api/v1/planes/${plan.id}`, {
        precio_mensual: Number(precio),
        limite_usuarios: Number(limite),
        modulos,
        agente_vale_incluido: agentesIA.vale,
        agente_yhorge_incluido: agentesIA.yhorge,
        agente_alo_incluido: agentesIA.alo,
      });
      onGuardado(data);
      setMensaje("Plan actualizado.");
    } catch {
      setMensaje("No se pudo guardar el plan.");
    }
    setGuardando(false);
  }

  return (
    <div className="rounded-3xl border border-slate-100/80 bg-white p-6 shadow-sm space-y-4">
      <h3 className="text-lg font-black tracking-tight text-slate-900">{plan.nombre}</h3>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col">
          <span className={labelCls}>Precio Mensual ($)</span>
          <input type="number" step="0.01" min="0" className={inputCls} value={precio} onChange={(e) => setPrecio(e.target.value)} />
        </label>
        <label className="flex flex-col">
          <span className={labelCls}>Límite de Usuarios</span>
          <input type="number" step="1" min="1" className={inputCls} value={limite} onChange={(e) => setLimite(e.target.value)} />
        </label>
      </div>
      <MatrizModulosAgentes
        modulos={modulos}
        onToggleModulo={toggleModulo}
        agentesIA={agentesIA}
        onToggleAgenteIA={toggleAgenteIA}
      />
      {mensaje && <p className="text-sm font-medium text-slate-600">{mensaje}</p>}
      <button
        type="button"
        onClick={guardar}
        disabled={guardando}
        className="w-full rounded-2xl bg-slate-900 py-2.5 text-sm font-bold text-white transition-all duration-300 hover:bg-slate-700 disabled:bg-slate-400"
      >
        {guardando ? "Guardando..." : "Guardar Cambios del Plan"}
      </button>
    </div>
  );
}

export default function CatalogoPlanes() {
  const [planes, setPlanes] = useState<PlanCatalogo[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    apiClient
      .get<PlanCatalogo[]>("/api/v1/planes")
      .then(({ data }) => setPlanes(data))
      .finally(() => setCargando(false));
  }, []);

  function onGuardado(actualizado: PlanCatalogo) {
    setPlanes((prev) => prev.map((p) => (p.id === actualizado.id ? actualizado : p)));
  }

  if (cargando) {
    return <p className="text-sm text-slate-400">Cargando catálogo de planes...</p>;
  }

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-black tracking-tight text-slate-900">Catálogo de Planes</h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {planes.map((plan) => (
          <PlanCard key={plan.id} plan={plan} onGuardado={onGuardado} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Render it from `ModuloEmpresas.tsx`, above the "Alta de Empresa" form**

In `frontend/src/components/ModuloEmpresas.tsx`:

1. Add the import near the top:

```tsx
import CatalogoPlanes from "./empresas/CatalogoPlanes";
```

2. In the returned JSX, right after the `{error && ...}` line and before the `<form onSubmit={handleSubmit} ...>` line, add:

```tsx
      <CatalogoPlanes />
```

- [ ] **Step 3: Build and manually verify**

```bash
cd "e:/PROYECTOS_IA/SaaS MiniMarket/frontend"
npm run build
```

Expected: zero TypeScript errors.

Then start both servers and check in the browser:

```bash
cd "e:/PROYECTOS_IA/SaaS MiniMarket"
"venv/Scripts/python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 > backend_run.log 2>&1 &
cd frontend && npm run dev > ../frontend_run.log 2>&1 &
```

Open `http://localhost:5173/`, log in as `ypachano@gmail.com` / `Minimarket2026`, go to "Consola SaaS Maestro". Expected: 3 plan cards (Básico/Pro/Max) render above the "Alta de Empresa" form, each showing its price, user limit, and the same module/agent toggle grid; editing a price and clicking "Guardar Cambios del Plan" shows "Plan actualizado." and the change survives a page refresh.

- [ ] **Step 4: Commit**

```bash
cd "e:/PROYECTOS_IA/SaaS MiniMarket"
git add frontend/src/components/empresas/CatalogoPlanes.tsx frontend/src/components/ModuloEmpresas.tsx
git commit -m "feat: add editable Catalogo de Planes screen to Consola Maestro"
```

---

### Task 7: Frontend — reorganize "Alta de Empresa" (Datos de la Empresa / Datos del Dueño / Plan)

**Files:**
- Modify: `frontend/src/components/ModuloEmpresas.tsx`

**Interfaces:**
- Consumes: `PlanCatalogo` type (Task 6); `AgenteIAKey` (Task 5).

- [ ] **Step 1: Update the form state shape**

In `frontend/src/components/ModuloEmpresas.tsx`, replace the `initialForm` object (currently lines 102-119) with:

```tsx
const initialForm = {
  // Datos de la Empresa
  rif: "",
  razonSocial: "",
  telefono: "",
  direccion: "",
  tipoNegocio: TIPOS_NEGOCIO[0].value as string,
  nombreCorto: "",
  logoUrl: "",
  sitioWeb: "",
  instagram: "",
  facebook: "",
  whatsapp: "",
  tiktok: "",
  x: "",
  colorPrimario: "#00ebc7",
  colorSecundario: "#111936",
  // Plan y vigencia
  planId: "",
  fechaInicio: today(),
  fechaVencimiento: "",
  // Datos del Dueño (también su identidad de acceso)
  nombreAdmin: "",
  emailAdmin: "",
  telefonoAdmin: "",
  claveTemporal: "",
};
```

This removes `plan` (the old hardcoded `PLANES[0]` string) and `usuarioAdmin`, and adds `direccion`, `sitioWeb`, `instagram`, `facebook`, `whatsapp`, `tiktok`, `x`, `planId`, `telefonoAdmin`. `limiteUsuarios` is also removed from manual entry — Task 7 Step 3 below derives it from the selected plan instead (still overridable via the matrix's own state, consistent with "se precargan pero se pueden ajustar").

- [ ] **Step 2: Remove the now-unused `PLANES` constant**

Delete the line `const PLANES = ["Básico", "Profesional", "Premium", "Custom"];` near the top of the file — it's replaced by the real catalog fetched in Step 3.

- [ ] **Step 3: Fetch the plan catalog and add the prefill handler**

In `frontend/src/components/ModuloEmpresas.tsx`, add this import:

```tsx
import { useEffect, useState, type FormEvent } from "react";
import type { PlanCatalogo } from "./empresas/CatalogoPlanes";
```

(merge with the existing `import { useState, type FormEvent } from "react";` line — add `useEffect` to it instead of a second React import.)

Inside `export default function ModuloEmpresas() { ... }`, add this state and effect right after the existing `const [suscripcion, actualizarSuscripcion] = useSuscripcion();` line:

```tsx
  const [catalogoPlanes, setCatalogoPlanes] = useState<PlanCatalogo[]>([]);

  useEffect(() => {
    apiClient.get<PlanCatalogo[]>("/api/v1/planes").then(({ data }) => setCatalogoPlanes(data));
  }, []);

  function seleccionarPlan(planIdStr: string) {
    set("planId", planIdStr);
    const plan = catalogoPlanes.find((p) => String(p.id) === planIdStr);
    if (!plan) return;
    setModulos(plan.modulos);
    setAgentesIA({ vale: plan.agente_vale_incluido, yhorge: plan.agente_yhorge_incluido, alo: plan.agente_alo_incluido });
  }
```

- [ ] **Step 4: Update `handleSubmit`'s validation and payload**

Replace the validation block in `handleSubmit` (currently checking `form.nombreAdmin`, `form.emailAdmin`, `form.usuarioAdmin`, `form.claveTemporal`) with:

```tsx
    if (!form.rif.trim() || !form.razonSocial.trim() || !form.telefono.trim()) {
      setError("RIF, Razón Social y Teléfono de la Empresa son obligatorios.");
      return;
    }

    if (!form.nombreAdmin.trim() || !form.emailAdmin.trim() || !form.claveTemporal.trim()) {
      setError("Nombre del Dueño, Correo y Clave Temporal son obligatorios.");
      return;
    }
```

Remove the old `const limite = Number(form.limiteUsuarios); if (Number.isNaN(limite) || limite <= 0) { ... }` block entirely (no more manual `limiteUsuarios` input — see Step 1).

Replace the `apiClient.post("/api/v1/auth/registrar-saas", { ... })` payload with:

```tsx
      await apiClient.post("/api/v1/auth/registrar-saas", {
        nombre_empresa: form.razonSocial.trim(),
        rif_or_cedula: form.rif.trim(),
        telefono: form.telefono.trim(),
        direccion: form.direccion.trim() || null,
        tipo_negocio: form.tipoNegocio,
        plan_id: form.planId ? Number(form.planId) : null,
        sitio_web: form.sitioWeb.trim() || null,
        instagram: form.instagram.trim() || null,
        facebook: form.facebook.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        tiktok: form.tiktok.trim() || null,
        x: form.x.trim() || null,
        modulos_override: modulos,
        nombre_corto: form.nombreCorto.trim() || null,
        logo_url: form.logoUrl.trim() || null,
        color_primario: form.colorPrimario,
        color_secundario: form.colorSecundario,
        agente_vale_activo: agentesIA.vale,
        agente_yhorge_activo: agentesIA.yhorge,
        agente_alo_activo: agentesIA.alo,
        nombre_admin: form.nombreAdmin.trim(),
        email_admin: form.emailAdmin.trim(),
        telefono_admin: form.telefonoAdmin.trim() || null,
        password_admin: form.claveTemporal,
      });
```

And update the local-state `nuevaEmpresa` object below it (used only for the still-mock empresas table) to read `plan: catalogoPlanes.find((p) => String(p.id) === form.planId)?.nombre ?? "Sin plan"` instead of `form.plan`, and `limiteUsuarios: catalogoPlanes.find((p) => String(p.id) === form.planId)?.limite_usuarios ?? 0` instead of `limite`.

- [ ] **Step 5: Rewrite the "Alta de Empresa" JSX into the 3 blocks**

Replace the existing `{/* --- Alta de Empresa --- */}` section and the `{/* --- Credenciales Maestras --- */}` section (currently lines 357-514) with:

```tsx
        {/* --- Datos de la Empresa --- */}
        <section>
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">Datos de la Empresa</h3>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <label className="flex flex-col">
              <span className={labelCls}>RIF</span>
              <input className={inputCls} value={form.rif} onChange={(e) => set("rif", formatRif(e.target.value))} placeholder="J-12345678-0" maxLength={12} required />
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>Razón Social</span>
              <input className={inputCls} value={form.razonSocial} onChange={(e) => set("razonSocial", e.target.value)} placeholder="Ej: MiniMarket Barinas C.A." required />
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>Teléfono de la Empresa</span>
              <input className={inputCls} value={form.telefono} onChange={(e) => set("telefono", e.target.value)} placeholder="+584141234567" required />
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>Dirección</span>
              <input className={inputCls} value={form.direccion} onChange={(e) => set("direccion", e.target.value)} placeholder="Av. Principal, Barinas" />
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>Tipo de Negocio</span>
              <select className={inputCls} value={form.tipoNegocio} onChange={(e) => set("tipoNegocio", e.target.value)} required>
                {TIPOS_NEGOCIO.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>Nombre Reducido</span>
              <input className={inputCls} value={form.nombreCorto} onChange={(e) => set("nombreCorto", e.target.value)} placeholder="Ej: AgroBarinas" />
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>URL del Logo</span>
              <input className={inputCls} value={form.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} placeholder="https://.../logo.png" />
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>Sitio Web</span>
              <input className={inputCls} value={form.sitioWeb} onChange={(e) => set("sitioWeb", e.target.value)} placeholder="https://miempresa.com" />
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>Instagram</span>
              <input className={inputCls} value={form.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder="@miempresa" />
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>Facebook</span>
              <input className={inputCls} value={form.facebook} onChange={(e) => set("facebook", e.target.value)} placeholder="facebook.com/miempresa" />
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>WhatsApp</span>
              <input className={inputCls} value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} placeholder="+584141234567" />
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>TikTok</span>
              <input className={inputCls} value={form.tiktok} onChange={(e) => set("tiktok", e.target.value)} placeholder="@miempresa" />
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>X (Twitter)</span>
              <input className={inputCls} value={form.x} onChange={(e) => set("x", e.target.value)} placeholder="@miempresa" />
            </label>
            <div className="flex items-center gap-4">
              <label className="flex flex-1 flex-col">
                <span className={labelCls}>Color Primario</span>
                <input type="color" className="mt-1 h-10 w-full cursor-pointer rounded-xl border border-slate-200" value={form.colorPrimario} onChange={(e) => set("colorPrimario", e.target.value)} />
              </label>
              <label className="flex flex-1 flex-col">
                <span className={labelCls}>Color Secundario</span>
                <input type="color" className="mt-1 h-10 w-full cursor-pointer rounded-xl border border-slate-200" value={form.colorSecundario} onChange={(e) => set("colorSecundario", e.target.value)} />
              </label>
            </div>
          </div>
        </section>

        {/* --- Datos del Dueño --- */}
        <section>
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">Datos del Dueño</h3>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <label className="flex flex-col">
              <span className={labelCls}>Nombre Completo</span>
              <input className={inputCls} value={form.nombreAdmin} onChange={(e) => set("nombreAdmin", e.target.value)} placeholder="Ej: Carlos Gerente" required />
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>Correo (su acceso al sistema)</span>
              <input type="email" className={inputCls} value={form.emailAdmin} onChange={(e) => set("emailAdmin", e.target.value)} placeholder="dueno@empresa.com" required />
              <p className="mt-1 text-xs text-slate-400">El dueño inicia sesión con este correo.</p>
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>Teléfono del Dueño</span>
              <input className={inputCls} value={form.telefonoAdmin} onChange={(e) => set("telefonoAdmin", e.target.value)} placeholder="+584141234567" />
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>Clave Temporal</span>
              <input type="password" className={inputCls} value={form.claveTemporal} onChange={(e) => set("claveTemporal", e.target.value)} required />
              <p className="mt-1 text-xs text-slate-400">El cliente deberá cambiar esta clave obligatoriamente en su primer inicio de sesión.</p>
            </label>
          </div>
        </section>
```

- [ ] **Step 6: Update the "Plan de Suscripción" select inside the existing "Cronómetro de Vencimiento" section**

The "Cronómetro de Vencimiento" section (after the two blocks above) currently only has the two date inputs. Add the Plan select as its first field, so the section becomes "Plan y Vigencia":

```tsx
        {/* --- Plan y Vigencia --- */}
        <section>
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">Plan y Vigencia</h3>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <label className="flex flex-col col-span-2">
              <span className={labelCls}>Plan de Suscripción</span>
              <select className={inputCls} value={form.planId} onChange={(e) => seleccionarPlan(e.target.value)} required>
                <option value="" disabled>Selecciona un plan...</option>
                {catalogoPlanes.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre} — ${p.precio_mensual}/mes</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-400">Al elegir un plan se precargan sus módulos y agentes abajo — puedes ajustarlos después.</p>
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>Fecha de Inicio de Suscripción</span>
              <input type="date" className={inputCls} value={form.fechaInicio} onChange={(e) => set("fechaInicio", e.target.value)} required />
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>Fecha de Vencimiento</span>
              <input type="date" className={inputCls} value={form.fechaVencimiento} onChange={(e) => set("fechaVencimiento", e.target.value)} required />
            </label>
          </div>
        </section>
```

(Delete the old standalone "Cronómetro de Vencimiento" section that only had the date fields — it's replaced by this one.)

- [ ] **Step 7: Build and manually verify the full flow**

```bash
cd "e:/PROYECTOS_IA/SaaS MiniMarket/frontend"
npm run build
```

Expected: zero TypeScript errors.

With both servers running (per Task 6 Step 3), in the browser: open Consola SaaS Maestro, confirm the form now shows "Datos de la Empresa" (with redes/web fields), "Datos del Dueño" (4 fields, no username field), and "Plan y Vigencia" with a working Plan select that, when changed, visibly flips the toggles in "Módulos Autorizados"/"Guías de IA Independientes" below. Fill the form with a brand-new RIF/email and submit — expect success (no validation errors) and the new company appears in the table below with the chosen plan's name.

- [ ] **Step 8: Commit**

```bash
cd "e:/PROYECTOS_IA/SaaS MiniMarket"
git add frontend/src/components/ModuloEmpresas.tsx
git commit -m "feat: reorganize Alta de Empresa into Empresa/Dueno/Plan sections with real plan prefill"
```

---

### Task 8: Final end-to-end verification

**Files:**
- None (verification only).

- [ ] **Step 1: Full backend + frontend build**

```bash
cd "e:/PROYECTOS_IA/SaaS MiniMarket/frontend"
npm run build
cd "e:/PROYECTOS_IA/SaaS MiniMarket"
"venv/Scripts/python.exe" -c "import app.main; print('backend imports ok')"
```

Expected: both succeed with zero errors.

- [ ] **Step 2: Run the existing smoke test (must still pass unmodified)**

```bash
cd "e:/PROYECTOS_IA/SaaS MiniMarket"
"venv/Scripts/python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 > backend_run.log 2>&1 &
cd frontend && npm run dev > ../frontend_run.log 2>&1 &
cd "e:/PROYECTOS_IA/SaaS MiniMarket"
sleep 3
bash .claude/skills/run-saas-minimarket/smoke.sh
```

Expected: `SMOKE OK: login + authenticated API call + frontend load all succeeded.` — confirms this plan's changes to `EmpresaConfigResponse`/`mi-config` did not break the existing tenant's config response.

- [ ] **Step 3: Manual walkthrough of the full Consola Maestro flow**

In the browser (logged in as `ypachano@gmail.com` / `Minimarket2026`, role Propietario), in "Consola SaaS Maestro":
- Catálogo de Planes: edit Pro's price, save, refresh the page, confirm the new price persists.
- Alta de Empresa: pick a plan, confirm modules/agents prefill; register a brand-new test company; confirm no leftover "Usuario Administrador Inicial" field anywhere.
- Confirm the existing tenant (`MiniMarket Express`, id 1) still loads its dashboard normally after logging in as its own propietario — this verifies `calcular_modulos_habilitados` didn't change its module list (it has no `modulos_override` set).

- [ ] **Step 4: Stop dev servers**

```bash
kill %1 %2 2>/dev/null || true
```
