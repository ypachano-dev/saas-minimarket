---
name: run-saas-minimarket
description: Build, launch, and drive the SaaS MiniMarket app (FastAPI backend + Vite/React frontend) — use when asked to run, start, test-login, or smoke-test this project, or to verify a backend/frontend change actually works end-to-end.
---

Full-stack app: FastAPI backend at repo root (`app/`) + Vite/React frontend
in `frontend/`. SQLite db (`saas_minimarket.db`) at repo root, no external
services needed. All paths below are relative to the repo root
(`SaaS MiniMarket/`).

The driver is `.claude/skills/run-saas-minimarket/smoke.sh` — a curl-based
smoke test that logs in and hits an authenticated endpoint. Use it after any
backend change instead of just eyeballing `/docs`.

## Prerequisites

Already-installed Python venv with `requirements.txt`, and `frontend/node_modules`
(`npm install` in `frontend/` if missing). No OS packages needed beyond Python + Node.

## Run (agent path)

1. Start the backend **without `--reload`** (see Gotchas — `--reload` breaks
   the dashboard on this project):
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000 &
   ```
2. Start the frontend dev server:
   ```bash
   cd frontend && npm run dev &
   ```
   Vite defaults to port 5173. If something is already bound to 5173, Vite
   picks 5174 instead — but the backend's CORS only allows
   `http://localhost:5173` (hardcoded in `app/main.py`), so a frontend on
   5174 cannot call the API. Check `netstat -ano | grep LISTEN` for an
   already-running 5173 instance before assuming you need to start one.
3. Drive it:
   ```bash
   bash .claude/skills/run-saas-minimarket/smoke.sh
   ```
   This logs in via `/api/v1/auth/login`, calls the authenticated
   `/api/v1/empresa/mi-config` endpoint, and checks the frontend responds.
   Override `SMOKE_EMAIL`/`SMOKE_PASSWORD`/`BACKEND_URL`/`FRONTEND_URL` env
   vars if needed.

There is no demo/bypass login anymore (it was deliberately removed from
`app/core/security.py` for security). To get a working login for the smoke
test or manual browser testing, create/update a real user directly against
the DB:
```bash
python -c "
from app.db.session import SessionLocal
from app.models.empresa import Empresa   # must import Empresa before Usuario
from app.models.usuario import Usuario   # (see Gotchas) or mapper init fails
from app.core.security import generar_hash_password
db = SessionLocal()
u = db.query(Usuario).filter(Usuario.email == 'ypachano@gmail.com').first()
if u:
    u.password_hash = generar_hash_password('Minimarket2026')
else:
    u = Usuario(empresa_id=1, nombre='Ypachano', email='ypachano@gmail.com',
                password_hash=generar_hash_password('Minimarket2026'), rol='propietario')
    db.add(u)
db.commit()
"
```

## Run (human path)

Open `http://localhost:5173/` in a browser and log in with email/password
(POST body is JSON, see Gotchas). Browser DevTools Network tab shows the
same `/api/v1/...` calls the smoke script makes.

## Gotchas

- **`uvicorn --reload` is NOT used on this project.** Confirmed by checking
  the actual running process. Any change to `app/main.py` (or anything it
  imports) requires killing and relaunching the uvicorn process by hand —
  editing the file alone will not pick up the change. The frontend (Vite)
  does have HMR, so this only bites the backend.
- **`/api/v1/auth/login` takes a JSON body, not OAuth2 form data**, despite
  `oauth2_scheme = OAuth2PasswordBearer(...)` being declared in
  `app/core/security.py` (that's only for Swagger's "Authorize" button /
  bearer-token validation, not the login endpoint itself). Send
  `{"email": ..., "password": ...}` with `Content-Type: application/json`.
  Sending `username=...&password=...` form-encoded (the usual OAuth2 pattern)
  fails with a Pydantic "input should be a valid dictionary" error.
- **CORS is hardcoded to `http://localhost:5173`** in `app/main.py`. If Vite
  falls back to another port (5173 already taken), the frontend loads fine
  but every API call fails CORS silently in the browser console — check the
  actual bound port before debugging "nothing works."
- **Creating a `Usuario` row via a standalone script needs `Empresa` imported
  first.** `from app.models.usuario import Usuario` alone raises
  `NoReferencedTableError: ... could not find table 'empresa'` when you
  `db.add()`/`commit()`, because the FK target table's mapper was never
  registered. Import `app.models.empresa` (and any other FK target) before
  touching the session.
- **There is no demo bypass anymore.** An earlier version of
  `app/core/security.py` had a hardcoded bypass token suffix
  (`.signature_demo`) for local testing — it was intentionally removed.
  Don't reintroduce it; create a real DB user instead (see above).
- **Per-tenant module/agent visibility (sidebar items like "Estadísticas
  Avanzadas (VALE)", "Cartera y Créditos (YHORGE)", "Módulo CRM (ALO)") is
  driven entirely by `GET /api/v1/empresa/mi-config`** — `modulos_habilitados`
  (from `app/core/negocio_config.py`, keyed by `tipo_negocio`) and the three
  `agente_*_activo` booleans on the `Empresa` row. If a module/agent seems
  "missing" in the UI, check this endpoint's response first — it tells you
  immediately whether it's a backend/data issue (flag off, wrong
  `tipo_negocio`) or a frontend/browser-state issue (stale build, wrong
  logged-in role) before touching any code.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Login returns `model_attributes_type` / "Input should be a valid dictionary" | You sent form-encoded data; send JSON instead (see Gotchas). |
| Backend change has no effect after editing `app/main.py` | Kill the uvicorn process and restart it; there's no `--reload`. |
| Frontend loads but every request fails / network errors in console | Check which port Vite actually bound (`netstat`) — must be 5173 to match CORS. |
| `NoReferencedTableError: ... could not find table 'empresa'` in a one-off script | Import `app.models.empresa` before creating/saving a `Usuario`. |
