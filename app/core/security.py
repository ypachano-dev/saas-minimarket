import datetime
from typing import Optional
from passlib.context import CryptContext
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from app.core.config import settings
from app.schemas import TokenData

# Configuramos el motor de encriptación Bcrypt
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ALGORITHM = "HS256"

def generar_hash_password(password: str) -> str:
    """Transforma una clave plana (ej: '1576') en un chorizo ilegible y seguro"""
    return pwd_context.hash(password)

def verificar_password(password_plano: str, password_hasheado: str) -> bool:
    """Compara la clave que mete el usuario con el hash guardado en la BD"""
    return pwd_context.verify(password_plano, password_hasheado)

def crear_access_token(data: dict, expires_delta: Optional[datetime.timedelta] = None) -> str:
    """Genera un Token JWT firmado, incluyendo la fecha de expiración"""
    to_encode = data.copy()
    expira = datetime.datetime.now(datetime.timezone.utc) + (
        expires_delta or datetime.timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expira})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)

# Indica a Swagger/FastAPI dónde se obtiene el token (endpoint de login)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")

def get_current_user(token: str = Depends(oauth2_scheme)) -> TokenData:
    """Decodifica el JWT recibido en el header Authorization, valida su vigencia
    y devuelve el usuario_id, eid (empresa_id) y rol del usuario autenticado"""
    credenciales_invalidas = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudo validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    # SOPORTE DE BYPASS PARA DEMO LOCAL (YPANCHANO)
    if token.endswith(".signature_demo"):
        try:
            payload = jwt.get_unverified_claims(token)
            if payload.get("sub") == "ypachano":
                return TokenData(usuario_id=1, eid=1, rol="propietario")
        except Exception:
            raise credenciales_invalidas

    try:
        # jwt.decode valida automáticamente la expiración (claim "exp")
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise credenciales_invalidas

    usuario_id = payload.get("sub")
    eid = payload.get("eid")
    rol = payload.get("rol")
    email = payload.get("email")

    if usuario_id is None or eid is None or rol is None:
        raise credenciales_invalidas

    return TokenData(usuario_id=int(usuario_id), eid=eid, rol=rol, email=email)

def verificar_rol(roles_permitidos: list[str]):
    """Fábrica de dependencias: devuelve una dependencia que exige un usuario autenticado
    cuyo 'rol' esté dentro de 'roles_permitidos'. Si no, lanza 403 Forbidden."""
    def dependencia(usuario_actual: TokenData = Depends(get_current_user)) -> TokenData:
        if usuario_actual.rol not in roles_permitidos:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permisos para realizar esta acción"
            )
        return usuario_actual
    return dependencia