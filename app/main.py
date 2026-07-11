import os
import time
import logging
from collections import defaultdict
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from jose import jwt, JWTError
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.db.session import engine, tenant_context
from app.core.config import settings
from app.core.security import ALGORITHM

# Configuración de Logging
logger = logging.getLogger("app")

# Inicialización de FastAPI
app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    docs_url="/docs",
    redoc_url=None
)

# ─────────────────────────────────────────────────────────────
# Middlewares
# ─────────────────────────────────────────────────────────────

# Rate Limiting en memoria (Offline-friendly)
historial_peticiones = defaultdict(lambda: defaultdict(list))

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    path = request.url.path
    if not path.startswith("/api/"):
        return await call_next(request)
        
    client_ip = request.client.host if request.client else "unknown"
    ahora = time.time()
    
    limite_peticiones, ventana_segundos = (100, 60)
    if path == "/api/v1/auth/login":
        limite_peticiones, ventana_segundos = (5, 60)
        
    timestamps = historial_peticiones[client_ip][path]
    timestamps = [t for t in timestamps if ahora - t < ventana_segundos]
    
    if len(timestamps) >= limite_peticiones:
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={"detail": "Demasiadas peticiones. Por favor, intenta de nuevo más tarde."}
        )
        
    timestamps.append(ahora)
    historial_peticiones[client_ip][path] = timestamps
    return await call_next(request)


# Multi-Tenancy context assignment Middleware
@app.middleware("http")
async def tenant_middleware(request: Request, call_next):
    auth_header = request.headers.get("Authorization")
    tenant_id = None
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
            tenant_id = payload.get("eid")
        except JWTError:
            pass
            
    token_context = tenant_context.set(tenant_id)
    try:
        response = await call_next(request)
    finally:
        tenant_context.reset(token_context)
    return response


# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):5173",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────
# Manejadores de Excepciones
# ─────────────────────────────────────────────────────────────
@app.exception_handler(SQLAlchemyError)
def manejador_error_bd(request: Request, exc: SQLAlchemyError):
    logger.exception("Error de base de datos no controlado")
    return JSONResponse(status_code=500, content={"detail": "Error interno al procesar la solicitud."})


@app.exception_handler(Exception)
def manejador_error_generico(request: Request, exc: Exception):
    logger.exception("Error no controlado")
    return JSONResponse(status_code=500, content={"detail": "Error interno al procesar la solicitud."})


# ─────────────────────────────────────────────────────────────
# Archivos Estáticos
# ─────────────────────────────────────────────────────────────
os.makedirs("static/logos", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")


# ─────────────────────────────────────────────────────────────
# Eventos de Ciclo de Vida
# ─────────────────────────────────────────────────────────────
@app.on_event("startup")
def _crear_indices_defensivos() -> None:
    with engine.connect() as conn:
        conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ux_turno_caja_abierto_unico "
            "ON turnocaja (empresa_id, usuario_id) WHERE estado = 'ABIERTO'"
        ))
        for ddl in [
            "ALTER TABLE cuenta_tesoreria ADD COLUMN saldo_cargado_por VARCHAR(100)",
            "ALTER TABLE cuenta_tesoreria ADD COLUMN saldo_fecha DATETIME",
        ]:
            try:
                conn.execute(text(ddl))
            except Exception:
                pass
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS saasConfiguracion (
                    id INTEGER PRIMARY KEY DEFAULT 1,
                    nombre_proveedor VARCHAR(100) NOT NULL DEFAULT '',
                    banco_nombre VARCHAR(80) NOT NULL DEFAULT '',
                    banco_codigo VARCHAR(10) NOT NULL DEFAULT '',
                    rif VARCHAR(20) NOT NULL DEFAULT '',
                    telefono_cobro VARCHAR(20) NOT NULL DEFAULT '',
                    zelle_email VARCHAR(100) NOT NULL DEFAULT '',
                    zelle_titular VARCHAR(100) NOT NULL DEFAULT ''
                )
            """))
            existing = conn.execute(text("SELECT COUNT(*) FROM saasConfiguracion")).scalar()
            if existing == 0:
                conn.execute(text(
                    "INSERT INTO saasConfiguracion (id, nombre_proveedor, banco_nombre, banco_codigo, rif, telefono_cobro, zelle_email, zelle_titular) "
                    "VALUES (1, '', '', '', '', '', '', '')"
                ))
        except Exception:
            pass
        conn.commit()


# ─────────────────────────────────────────────────────────────
# Registro de Routers
# ─────────────────────────────────────────────────────────────
from app.routers import auth as router_auth
from app.routers import saas_maestro as router_saas
from app.routers import inventario as router_inventario
from app.routers import caja as router_caja
from app.routers import operaciones as router_operaciones
from app.routers import tesoreria as router_tesoreria
from app.routers import crm as router_crm
from app.routers import ia_agents as router_ia_agents
from app.routers import estadisticas as router_estadisticas
from app.routers import facturacion as router_facturacion

app.include_router(router_auth.router)
app.include_router(router_saas.router)
app.include_router(router_inventario.router)
app.include_router(router_caja.router)
app.include_router(router_operaciones.router)
app.include_router(router_tesoreria.router)
app.include_router(router_crm.router)
app.include_router(router_ia_agents.router)
app.include_router(router_estadisticas.router)
app.include_router(router_facturacion.router)


# ─────────────────────────────────────────────────────────────
# Endpoints Generales
# ─────────────────────────────────────────────────────────────
@app.get("/api/v1/status", tags=["Sanity Check"])
def read_root():
    return {
        "status": "online",
        "sistema": settings.PROJECT_NAME,
        "api_version": "1.0.0",
        "ambiente": "desarrollo_local"
    }


# ─────────────────────────────────────────────────────────────
# Servir Frontend
# ─────────────────────────────────────────────────────────────
_frontend_dist = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")
if os.path.isdir(_frontend_dist):
    @app.get("/{full_path:path}", include_in_schema=False)
    def servir_frontend(full_path: str):
        candidato = os.path.join(_frontend_dist, full_path)
        if full_path and os.path.isfile(candidato):
            return FileResponse(candidato)
        return FileResponse(os.path.join(_frontend_dist, "index.html"))
