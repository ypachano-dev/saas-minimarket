"""
Router: Autenticación
Login con JWT y validación de credenciales.
El token incluye sub (user_id), eid (empresa_id), rol, email y nombre.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import verificar_password, crear_access_token
from app.db.session import SessionLocal
from app.models.usuario import Usuario
from app.schemas import LoginRequest, Token

logger = logging.getLogger("app")

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/api/v1/auth/login", tags=["Autenticación SaaS"], response_model=Token)
def login(datos: LoginRequest, db: Session = Depends(get_db)):
    usuario = db.query(Usuario).filter(Usuario.email == datos.email).first()

    # bcrypt soporta como máximo 72 bytes; truncamos igual que al registrar
    if not usuario or not verificar_password(datos.password[:72], usuario.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo o contraseña incorrectos.",
        )

    if not usuario.status:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Este usuario se encuentra inactivo. Contacte al administrador.",
        )

    # El token incluye eid (empresa_id) y rol para mantener el aislamiento Multi-Tenant.
    # Se usa la clave corta 'eid' para reducir el tamaño del string JWT que viaja por la red.
    access_token = crear_access_token(
        data={
            "sub": str(usuario.id),
            "eid": usuario.empresa_id,
            "rol": usuario.rol,
            "email": usuario.email,
            "nombre": usuario.nombre,
        }
    )

    return Token(access_token=access_token, token_type="bearer")
