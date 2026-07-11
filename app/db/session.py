from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session
from app.core.config import settings
from contextvars import ContextVar
from typing import Optional

# Contexto global para almacenar el empresa_id del inquilino activo durante la petición
tenant_context: ContextVar[Optional[int]] = ContextVar("tenant_context", default=None)

if "sqlite" in settings.DATABASE_URL:
    engine = create_engine(
        settings.DATABASE_URL,
        connect_args={"check_same_thread": False},
    )
else:
    # PostgreSQL en producción: pool de conexiones adecuado para DigitalOcean Managed DB
    engine = create_engine(
        settings.DATABASE_URL,
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True,   # detecta conexiones muertas antes de usarlas
        pool_recycle=1800,    # recicla conexiones cada 30 min para evitar timeouts del server
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@event.listens_for(Session, "do_orm_execute")
def interceptar_queries_multi_tenant(orm_execute_state):
    """
    Intercepta de forma global cualquier consulta ORM e inyecta el filtro
    de empresa_id de manera automática si el modelo mapeado lo posee.
    """
    if orm_execute_state.is_select and not orm_execute_state.execution_options.get("ignore_tenant_filter"):
        tenant_id = tenant_context.get()
        if tenant_id is not None:
            # Iterar sobre todos los mapeadores involucrados en la consulta
            for mapper in orm_execute_state.all_mappers:
                if hasattr(mapper.class_, "empresa_id"):
                    # Inyectar el filtro por el ID de la empresa del contexto actual
                    orm_execute_state.statement = orm_execute_state.statement.filter(
                        mapper.class_.empresa_id == tenant_id
                    )