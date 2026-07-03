from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # Variables de entorno con valores por defecto para desarrollo local
    PROJECT_NAME: str = "3Q Nexus ERP"
    PROVEEDOR: str = "3Q Solutions"
    API_V1_STR: str = "/api/v1"
    
    # Configuración de Seguridad (Llave secreta para JWT tokens)
    SECRET_KEY: str = "SUPER_SECRET_KEY_PRODUCCION_MINIMARKET_2026"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8  # 8 Días
    
    # Dev local: SQLite sin configuración extra.
    # Producción (DigitalOcean): setear DATABASE_URL en el .env o en las variables
    # de entorno del App Platform:
    #   postgresql://usuario:password@host:25060/dbname?sslmode=require
    DATABASE_URL: str = "sqlite:///./saas_minimarket.db"

    # Agentes de IA (VALE, YHORGE, ALO) - usan la API de Anthropic si hay key configurada.
    # Si está vacía, cada endpoint de agente cae a su propio resumen basado en reglas
    # sobre los mismos datos reales, así el SaaS nunca depende de un servicio externo
    # para funcionar (mismo patrón defensivo que la integración de Google Maps).
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-sonnet-4-6"

    # Permite cargar las variables desde un archivo .env si existe
    model_config = SettingsConfigDict(case_sensitive=True, env_file=".env")

settings = Settings()