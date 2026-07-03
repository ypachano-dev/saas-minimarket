from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

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