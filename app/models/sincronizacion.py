import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from app.models.base import Base

class ColaSincronizacion(Base):
    __tablename__ = "cola_sincronizacion"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False)
    usuario_id = Column(Integer, ForeignKey("usuario.id", ondelete="SET NULL"), nullable=True)
    
    # Tipo de entidad (por ejemplo: 'ticket', 'cliente', 'visita')
    entidad = Column(String(50), nullable=False)
    
    # Payload JSON con los datos a insertar o actualizar en la nube
    datos_json = Column(Text, nullable=False)
    
    # Estado de la transacción ('pendiente', 'sincronizado', 'error')
    estado = Column(String(20), default="pendiente", nullable=False)
    
    # Contador de reintentos
    intentos = Column(Integer, default=0, nullable=False)
    
    # Registro de mensajes de error de la API
    error_mensaje = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)
