"""
Router: Operaciones — Gestión de Clientes, Proveedores, Vehículos, Usuarios/Empleados, Configuración de Empresa y Sincronización Offline-First.
"""
import datetime
import logging
import json
import os
from decimal import Decimal
from pydantic import BaseModel

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.security import (
    get_current_user, verificar_rol,
    generar_hash_password, verificar_password
)
from app.db.session import SessionLocal
from app.models.cliente import Cliente
from app.models.proveedor import Proveedor
from app.models.vehiculo import Vehiculo
from app.models.usuario import Usuario
from app.models.empresa import Empresa
from app.models.plan import Plan
from app.models.saas_configuracion import SaasConfiguracion
from app.models.sincronizacion import ColaSincronizacion
from app.models.visita import VisitaCliente, EncuestaMarketing
from app.models.ticket import Ticket
from app.models.producto import Producto
from app.models.lote import Lote
from app.core.negocio_config import (
    NEGOCIO_CONFIG, normalizar_tipo_negocio, GUIAS_AGENTES_IA
)
from app.schemas import (
    TokenData,
    ClienteCreate, ClienteUpdate, ClienteResponse,
    ProveedorCreate, ProveedorUpdate, ProveedorResponse,
    VehiculoCreate, VehiculoUpdate, VehiculoUbicacionUpdate, VehiculoResponse,
    UsuarioCreate, UsuarioUpdate, UsuarioResponse, UsuarioGpsUpdate, VendedorUbicacionResponse,
    EmpresaConfigResponse, NomenclaturaNegocioResponse, TicketConfigResponse,
    TicketConfigUpdate, AgentesIAUpdate,
    ConfigFacturacionFiscalResponse, ConfigFacturacionFiscalUpdate,
    SincronizacionLoteRequest, SincronizacionLoteResponse, SincronizacionResultado
)
from app.core.facturacion_config import normalizar_modalidad_facturacion, normalizar_marca_impresora_fiscal
from app.integraciones.impresoras_fiscales import tiene_integracion_automatica

logger = logging.getLogger("app")
router = APIRouter()

ROLES_GESTION = ["admin", "propietario"]
ROLES_OPERACION = ["cajero", "admin", "propietario", "repartidor", "vendedor"]


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def normalizar_tamano_papel(valor: Optional[str]) -> str:
    if not valor:
        return "80mm"
    v = valor.strip().lower()
    if v in ("58mm", "80mm", "carta"):
        return v
    return "80mm"


def calcular_modulos_habilitados(modulos_base: list[str], modulos_override: dict | None, plan_modulos: dict | None = None) -> list[str]:
    if not modulos_override:
        resultado = set(modulos_base)
    else:
        resultado = set(modulos_base)
        for clave, incluido in modulos_override.items():
            if incluido:
                resultado.add(clave)
            else:
                resultado.discard(clave)
    if plan_modulos is not None:
        resultado = {m for m in resultado if plan_modulos.get(m) is True}
    return sorted(resultado)


# ─────────────────────────────────────────────────────────────
# Clientes
# ─────────────────────────────────────────────────────────────
@router.post("/api/v1/clientes", tags=["Clientes"], response_model=ClienteResponse, status_code=status.HTTP_201_CREATED)
def crear_cliente(datos: ClienteCreate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))):
    duplicado = db.query(Cliente).filter(Cliente.empresa_id == usuario_actual.eid, Cliente.cedula == datos.cedula).first()
    if duplicado:
        raise HTTPException(status_code=400, detail="Ya existe un cliente con esa cédula/RIF en su empresa.")
    nuevo_cliente = Cliente(empresa_id=usuario_actual.eid, **datos.model_dump())
    try:
        db.add(nuevo_cliente)
        db.commit()
        db.refresh(nuevo_cliente)
    except Exception:
        logger.exception("Error al registrar el cliente")
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al registrar el cliente.")
    return nuevo_cliente


@router.get("/api/v1/clientes", tags=["Clientes"], response_model=List[ClienteResponse])
def listar_clientes(q: Optional[str] = None, cedula: Optional[str] = None, cliente_id: Optional[int] = None, skip: int = 0, limit: int = 100, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))):
    query = db.query(Cliente).filter(Cliente.empresa_id == usuario_actual.eid)
    if cliente_id:
        query = query.filter(Cliente.id == cliente_id)
    if cedula:
        query = query.filter(Cliente.cedula == cedula)
    if q:
        termino = f"%{q}%"
        query = query.filter((Cliente.nombre.ilike(termino)) | (Cliente.cedula.ilike(termino)))
    return query.offset(skip).limit(limit).all()


@router.put("/api/v1/clientes/{cliente_id}", tags=["Clientes"], response_model=ClienteResponse)
def actualizar_cliente(cliente_id: int, datos: ClienteUpdate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))):
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id, Cliente.empresa_id == usuario_actual.eid).first()
    if not cliente:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="El cliente indicado no existe o no pertenece a su empresa.")
    datos_actualizados = datos.model_dump(exclude_unset=True)
    nueva_cedula = datos_actualizados.get("cedula")
    if nueva_cedula and nueva_cedula != cliente.cedula:
        duplicado = db.query(Cliente).filter(Cliente.empresa_id == usuario_actual.eid, Cliente.cedula == nueva_cedula, Cliente.id != cliente_id).first()
        if duplicado:
            raise HTTPException(status_code=400, detail="Ya existe otro cliente con esa cédula/RIF en su empresa.")
    for campo, valor in datos_actualizados.items():
        setattr(cliente, campo, valor)
    try:
        db.commit()
        db.refresh(cliente)
    except Exception:
        logger.exception("Error al actualizar el cliente")
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al actualizar el cliente.")
    return cliente


# ─────────────────────────────────────────────────────────────
# Proveedores
# ─────────────────────────────────────────────────────────────
@router.post("/api/v1/proveedores", tags=["Proveedores"], response_model=ProveedorResponse, status_code=status.HTTP_201_CREATED)
def crear_proveedor(datos: ProveedorCreate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))):
    duplicado = db.query(Proveedor).filter(Proveedor.empresa_id == usuario_actual.eid, Proveedor.rif == datos.rif.strip()).first()
    if duplicado:
        raise HTTPException(status_code=400, detail="Ya existe un proveedor con ese RIF en su empresa.")
    nuevo_proveedor = Proveedor(
        empresa_id=usuario_actual.eid, rif=datos.rif.strip(), nombre=datos.nombre.strip(),
        telefono=datos.telefono.strip() if datos.telefono else None,
        email=datos.email.strip() if datos.email else None,
        direccion=datos.direccion.strip() if datos.direccion else None
    )
    try:
        db.add(nuevo_proveedor)
        db.commit()
        db.refresh(nuevo_proveedor)
    except Exception:
        logger.exception("Error al registrar el proveedor")
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al registrar el proveedor.")
    return nuevo_proveedor


@router.get("/api/v1/proveedores", tags=["Proveedores"], response_model=List[ProveedorResponse])
def listar_proveedores(db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))):
    return db.query(Proveedor).filter(Proveedor.empresa_id == usuario_actual.eid).all()


@router.put("/api/v1/proveedores/{proveedor_id}", tags=["Proveedores"], response_model=ProveedorResponse)
def actualizar_proveedor(proveedor_id: int, datos: ProveedorUpdate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))):
    proveedor = db.query(Proveedor).filter(Proveedor.id == proveedor_id, Proveedor.empresa_id == usuario_actual.eid).first()
    if not proveedor:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado.")
    datos_actualizados = datos.model_dump(exclude_unset=True)
    nuevo_rif = datos_actualizados.get("rif")
    if nuevo_rif and nuevo_rif.strip() != proveedor.rif:
        duplicado = db.query(Proveedor).filter(Proveedor.empresa_id == usuario_actual.eid, Proveedor.rif == nuevo_rif.strip(), Proveedor.id != proveedor_id).first()
        if duplicado:
            raise HTTPException(status_code=400, detail="Ya existe otro proveedor con ese RIF en su empresa.")
    for campo, valor in datos_actualizados.items():
        setattr(proveedor, campo, valor.strip() if isinstance(valor, str) else valor)
    try:
        db.commit()
        db.refresh(proveedor)
    except Exception:
        logger.exception("Error al actualizar el proveedor")
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al actualizar el proveedor.")
    return proveedor


# ─────────────────────────────────────────────────────────────
# Vehículos
# ─────────────────────────────────────────────────────────────
@router.post("/api/v1/vehiculos", tags=["Vehículos"], response_model=VehiculoResponse, status_code=status.HTTP_201_CREATED)
def crear_vehiculo(datos: VehiculoCreate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))):
    duplicado = db.query(Vehiculo).filter(Vehiculo.empresa_id == usuario_actual.eid, Vehiculo.placa == datos.placa.strip()).first()
    if duplicado:
        raise HTTPException(status_code=400, detail="Ya existe un vehículo con esa placa en su empresa.")
    nuevo_vehiculo = Vehiculo(
        empresa_id=usuario_actual.eid, placa=datos.placa.strip(), marca=datos.marca.strip(),
        modelo=datos.modelo.strip(), tipo=datos.tipo.strip(), status=datos.status.strip()
    )
    try:
        db.add(nuevo_vehiculo)
        db.commit()
        db.refresh(nuevo_vehiculo)
    except Exception:
        logger.exception("Error al registrar el vehículo")
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al registrar el vehículo.")
    return nuevo_vehiculo


@router.get("/api/v1/vehiculos", tags=["Vehículos"], response_model=List[VehiculoResponse])
def listar_vehiculos(db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))):
    return db.query(Vehiculo).filter(Vehiculo.empresa_id == usuario_actual.eid).all()


@router.put("/api/v1/vehiculos/{vehiculo_id}", tags=["Vehículos"], response_model=VehiculoResponse)
def actualizar_vehiculo(vehiculo_id: int, datos: VehiculoUpdate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))):
    vehiculo = db.query(Vehiculo).filter(Vehiculo.id == vehiculo_id, Vehiculo.empresa_id == usuario_actual.eid).first()
    if not vehiculo:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado o no pertenece a su empresa.")
    datos_actualizados = datos.model_dump(exclude_unset=True)
    nueva_placa = datos_actualizados.get("placa")
    if nueva_placa and nueva_placa.strip() != vehiculo.placa:
        duplicado = db.query(Vehiculo).filter(Vehiculo.empresa_id == usuario_actual.eid, Vehiculo.placa == nueva_placa.strip(), Vehiculo.id != vehiculo_id).first()
        if duplicado:
            raise HTTPException(status_code=400, detail="Ya existe otro vehículo con esa placa en su empresa.")
    for campo, valor in datos_actualizados.items():
        setattr(vehiculo, campo, valor.strip() if isinstance(valor, str) else valor)
    try:
        db.commit()
        db.refresh(vehiculo)
    except Exception:
        logger.exception("Error al actualizar el vehículo")
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al actualizar el vehículo.")
    return vehiculo


@router.put("/api/v1/vehiculos/{vehiculo_id}/ubicacion", tags=["Vehículos"], response_model=VehiculoResponse)
def actualizar_ubicacion_vehiculo(vehiculo_id: int, datos: VehiculoUbicacionUpdate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))):
    vehiculo = db.query(Vehiculo).filter(Vehiculo.id == vehiculo_id, Vehiculo.empresa_id == usuario_actual.eid).first()
    if not vehiculo:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado o no pertenece a su empresa.")
    vehiculo.lat = datos.lat
    vehiculo.lng = datos.lng
    vehiculo.ubicacion_actualizada_en = datetime.datetime.now(datetime.timezone.utc)
    try:
        db.commit()
        db.refresh(vehiculo)
    except Exception:
        logger.exception("Error al actualizar la ubicación del vehículo")
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al actualizar la ubicación del vehículo.")
    return vehiculo


# ─────────────────────────────────────────────────────────────
# Usuarios / Empleados
# ─────────────────────────────────────────────────────────────
@router.post("/api/v1/usuarios", tags=["Usuarios"], response_model=UsuarioResponse, status_code=status.HTTP_201_CREATED)
def crear_usuario(datos: UsuarioCreate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))):
    duplicado = db.query(Usuario).filter(Usuario.email == datos.email.strip()).first()
    if duplicado:
        raise HTTPException(status_code=400, detail="El correo electrónico ya está en uso.")
    nuevo_usuario = Usuario(
        empresa_id=usuario_actual.eid, nombre=datos.nombre.strip(), email=datos.email.strip(),
        password_hash=generar_hash_password(datos.password[:72]), rol=datos.rol.strip().lower(), status=datos.status
    )
    try:
        db.add(nuevo_usuario)
        db.commit()
        db.refresh(nuevo_usuario)
    except Exception:
        logger.exception("Error al registrar el usuario")
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al registrar el usuario.")
    return nuevo_usuario


@router.get("/api/v1/usuarios", tags=["Usuarios"], response_model=List[UsuarioResponse])
def listar_usuarios(db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))):
    return db.query(Usuario).filter(Usuario.empresa_id == usuario_actual.eid).all()


@router.put("/api/v1/usuarios/{usuario_id}", tags=["Usuarios"], response_model=UsuarioResponse)
def actualizar_usuario(usuario_id: int, datos: UsuarioUpdate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))):
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id, Usuario.empresa_id == usuario_actual.eid).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    datos_actualizados = datos.model_dump(exclude_unset=True)
    nuevo_email = datos_actualizados.pop("email", None)
    if nuevo_email and nuevo_email.strip() != usuario.email:
        duplicado = db.query(Usuario).filter(Usuario.email == nuevo_email.strip(), Usuario.id != usuario_id).first()
        if duplicado:
            raise HTTPException(status_code=400, detail="El correo electrónico ya está en uso.")
        usuario.email = nuevo_email.strip()
    nueva_password = datos_actualizados.pop("password", None)
    if nueva_password:
        usuario.password_hash = generar_hash_password(nueva_password[:72])
    for campo, valor in datos_actualizados.items():
        setattr(usuario, campo, valor.strip().lower() if campo == "rol" and isinstance(valor, str) else (valor.strip() if isinstance(valor, str) else valor))
    try:
        db.commit()
        db.refresh(usuario)
    except Exception:
        logger.exception("Error al actualizar el usuario")
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al actualizar el usuario.")
    return usuario


@router.post("/api/v1/usuarios/gps", tags=["Fuerza de Ventas"])
def actualizar_gps_vendedor(datos: UsuarioGpsUpdate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(get_current_user)):
    usuario = db.query(Usuario).filter(Usuario.id == usuario_actual.usuario_id, Usuario.empresa_id == usuario_actual.eid).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    usuario.lat = datos.lat
    usuario.lng = datos.lng
    usuario.ubicacion_actualizada_en = datetime.datetime.now()
    try:
        db.commit()
        return {"status": "ok", "mensaje": "Ubicacion GPS actualizada con exito."}
    except Exception:
        logger.exception("Error al actualizar ubicacion")
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al actualizar ubicacion.")


@router.get("/api/v1/usuarios/vendedores/ubicaciones", tags=["Fuerza de Ventas"], response_model=List[VendedorUbicacionResponse])
def listar_ubicaciones_vendedores(db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))):
    return db.query(Usuario).filter(Usuario.empresa_id == usuario_actual.eid, Usuario.rol == "vendedor").all()


# ─────────────────────────────────────────────────────────────
# Configuración de Empresa / Inquilino
# ─────────────────────────────────────────────────────────────
@router.get("/api/v1/empresa/mi-config", tags=["Empresa"], response_model=EmpresaConfigResponse)
def obtener_mi_config_empresa(db: Session = Depends(get_db), usuario_actual: TokenData = Depends(get_current_user)) -> EmpresaConfigResponse:
    empresa = db.query(Empresa).filter(Empresa.id == usuario_actual.eid).first()
    if not empresa:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada.")
    tipo_negocio = normalizar_tipo_negocio(empresa.tipo_negocio)
    config = NEGOCIO_CONFIG[tipo_negocio]
    plan = None
    plan_modulos = None
    if empresa.plan_id:
        plan = db.query(Plan).filter(Plan.id == empresa.plan_id).first()
        if plan:
            plan_modulos = plan.modulos
    return EmpresaConfigResponse(
        id=empresa.id, rif=empresa.rif, nombre_comercial=empresa.nombre_comercial, nombre_corto=empresa.nombre_corto,
        tipo_negocio=tipo_negocio, color_primario=empresa.color_primario, color_secundario=empresa.color_secundario,
        logo_url=empresa.logo_url, modulos_habilitados=calcular_modulos_habilitados(config["modulos_base"], empresa.modulos_override, plan_modulos),
        nomenclatura=NomenclaturaNegocioResponse(**config["nomenclatura"]),
        agente_vale_activo=empresa.agente_vale_activo, agente_vale_prompt=empresa.agente_vale_prompt,
        agente_vale_modelo=empresa.agente_vale_modelo, agente_vale_temperatura=empresa.agente_vale_temperatura,
        agente_yhorge_activo=empresa.agente_yhorge_activo, agente_yhorge_prompt=empresa.agente_yhorge_prompt,
        agente_yhorge_modelo=empresa.agente_yhorge_modelo, agente_yhorge_temperatura=empresa.agente_yhorge_temperatura,
        agente_alo_activo=empresa.agente_alo_activo, agente_alo_prompt=empresa.agente_alo_prompt,
        agente_alo_modelo=empresa.agente_alo_modelo, agente_alo_temperatura=empresa.agente_alo_temperatura,
        agente_vale_incluido=plan.agente_vale_incluido if plan else False,
        agente_yhorge_incluido=plan.agente_yhorge_incluido if plan else False,
        agente_alo_incluido=plan.agente_alo_incluido if plan else False,
        ticket_config=TicketConfigResponse(
            tamano_papel=normalizar_tamano_papel(empresa.ticket_tamano_papel),
            mostrar_logo=empresa.ticket_mostrar_logo, mostrar_rif=empresa.ticket_mostrar_rif,
            texto_cabecera=empresa.ticket_texto_cabecera, texto_pie=empresa.ticket_texto_pie,
            desglosar_impuestos=empresa.ticket_desglosar_impuestos,
        ),
        config_facturacion_fiscal=ConfigFacturacionFiscalResponse(
            modalidad_facturacion=normalizar_modalidad_facturacion(empresa.modalidad_facturacion),
            imprenta_nombre=empresa.imprenta_nombre,
            imprenta_rif=empresa.imprenta_rif,
            imprenta_nro_providencia=empresa.imprenta_nro_providencia,
            imprenta_fecha_providencia=empresa.imprenta_fecha_providencia,
            imprenta_control_desde=empresa.imprenta_control_desde,
            imprenta_control_hasta=empresa.imprenta_control_hasta,
            impresora_fiscal_marca=normalizar_marca_impresora_fiscal(empresa.impresora_fiscal_marca),
            impresora_fiscal_integracion_automatica=tiene_integracion_automatica(normalizar_marca_impresora_fiscal(empresa.impresora_fiscal_marca)),
        ),
    )


@router.put("/api/v1/empresa/config-ticket", tags=["Empresa"], response_model=TicketConfigResponse)
def actualizar_config_ticket(datos: TicketConfigUpdate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))) -> TicketConfigResponse:
    empresa = db.query(Empresa).filter(Empresa.id == usuario_actual.eid).first()
    if not empresa:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada.")
    if datos.tamano_papel is not None:
        empresa.ticket_tamano_papel = datos.tamano_papel
    if datos.mostrar_logo is not None:
        empresa.ticket_mostrar_logo = datos.mostrar_logo
    if datos.mostrar_rif is not None:
        empresa.ticket_mostrar_rif = datos.mostrar_rif
    if datos.texto_cabecera is not None:
        empresa.ticket_texto_cabecera = datos.texto_cabecera
    if datos.texto_pie is not None:
        empresa.ticket_texto_pie = datos.texto_pie
    if datos.desglosar_impuestos is not None:
        empresa.ticket_desglosar_impuestos = datos.desglosar_impuestos
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No se pudo guardar la configuración de ticket.")
    return TicketConfigResponse(
        tamano_papel=normalizar_tamano_papel(empresa.ticket_tamano_papel),
        mostrar_logo=empresa.ticket_mostrar_logo, mostrar_rif=empresa.ticket_mostrar_rif,
        texto_cabecera=empresa.ticket_texto_cabecera, texto_pie=empresa.ticket_texto_pie,
        desglosar_impuestos=empresa.ticket_desglosar_impuestos,
    )


@router.put("/api/v1/empresa/config-agentes", tags=["Empresa"], response_model=EmpresaConfigResponse)
def actualizar_config_agentes(datos: AgentesIAUpdate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))) -> EmpresaConfigResponse:
    empresa = db.query(Empresa).filter(Empresa.id == usuario_actual.eid).first()
    if not empresa:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada.")
    if datos.agente_vale_activo is not None:
        empresa.agente_vale_activo = datos.agente_vale_activo
    if datos.agente_vale_prompt is not None:
        empresa.agente_vale_prompt = datos.agente_vale_prompt
    if datos.agente_vale_modelo is not None:
        empresa.agente_vale_modelo = datos.agente_vale_modelo
    if datos.agente_vale_temperatura is not None:
        empresa.agente_vale_temperatura = datos.agente_vale_temperatura
    if datos.agente_yhorge_activo is not None:
        empresa.agente_yhorge_activo = datos.agente_yhorge_activo
    if datos.agente_yhorge_prompt is not None:
        empresa.agente_yhorge_prompt = datos.agente_yhorge_prompt
    if datos.agente_yhorge_modelo is not None:
        empresa.agente_yhorge_modelo = datos.agente_yhorge_modelo
    if datos.agente_yhorge_temperatura is not None:
        empresa.agente_yhorge_temperatura = datos.agente_yhorge_temperatura
    if datos.agente_alo_activo is not None:
        empresa.agente_alo_activo = datos.agente_alo_activo
    if datos.agente_alo_prompt is not None:
        empresa.agente_alo_prompt = datos.agente_alo_prompt
    if datos.agente_alo_modelo is not None:
        empresa.agente_alo_modelo = datos.agente_alo_modelo
    if datos.agente_alo_temperatura is not None:
        empresa.agente_alo_temperatura = datos.agente_alo_temperatura
    try:
        db.commit()
        db.refresh(empresa)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No se pudo guardar la configuración de agentes.")
    tipo_negocio = normalizar_tipo_negocio(empresa.tipo_negocio)
    config = NEGOCIO_CONFIG[tipo_negocio]
    plan = None
    plan_modulos = None
    if empresa.plan_id:
        plan = db.query(Plan).filter(Plan.id == empresa.plan_id).first()
        if plan:
            plan_modulos = plan.modulos
    return EmpresaConfigResponse(
        id=empresa.id, rif=empresa.rif, nombre_comercial=empresa.nombre_comercial, nombre_corto=empresa.nombre_corto,
        tipo_negocio=tipo_negocio, color_primario=empresa.color_primario, color_secundario=empresa.color_secundario,
        logo_url=empresa.logo_url, modulos_habilitados=calcular_modulos_habilitados(config["modulos_base"], empresa.modulos_override, plan_modulos),
        nomenclatura=NomenclaturaNegocioResponse(**config["nomenclatura"]),
        agente_vale_activo=empresa.agente_vale_activo, agente_vale_prompt=empresa.agente_vale_prompt,
        agente_vale_modelo=empresa.agente_vale_modelo, agente_vale_temperatura=empresa.agente_vale_temperatura,
        agente_yhorge_activo=empresa.agente_yhorge_activo, agente_yhorge_prompt=empresa.agente_yhorge_prompt,
        agente_yhorge_modelo=empresa.agente_yhorge_modelo, agente_yhorge_temperatura=empresa.agente_yhorge_temperatura,
        agente_alo_activo=empresa.agente_alo_activo, agente_alo_prompt=empresa.agente_alo_prompt,
        agente_alo_modelo=empresa.agente_alo_modelo, agente_alo_temperatura=empresa.agente_alo_temperatura,
        agente_vale_incluido=plan.agente_vale_incluido if plan else False,
        agente_yhorge_incluido=plan.agente_yhorge_incluido if plan else False,
        agente_alo_incluido=plan.agente_alo_incluido if plan else False,
        ticket_config=TicketConfigResponse(
            tamano_papel=normalizar_tamano_papel(empresa.ticket_tamano_papel),
            mostrar_logo=empresa.ticket_mostrar_logo, mostrar_rif=empresa.ticket_mostrar_rif,
            texto_cabecera=empresa.ticket_texto_cabecera, texto_pie=empresa.ticket_texto_pie,
            desglosar_impuestos=empresa.ticket_desglosar_impuestos,
        ),
        config_facturacion_fiscal=ConfigFacturacionFiscalResponse(
            modalidad_facturacion=normalizar_modalidad_facturacion(empresa.modalidad_facturacion),
            imprenta_nombre=empresa.imprenta_nombre,
            imprenta_rif=empresa.imprenta_rif,
            imprenta_nro_providencia=empresa.imprenta_nro_providencia,
            imprenta_fecha_providencia=empresa.imprenta_fecha_providencia,
            imprenta_control_desde=empresa.imprenta_control_desde,
            imprenta_control_hasta=empresa.imprenta_control_hasta,
            impresora_fiscal_marca=normalizar_marca_impresora_fiscal(empresa.impresora_fiscal_marca),
            impresora_fiscal_integracion_automatica=tiene_integracion_automatica(normalizar_marca_impresora_fiscal(empresa.impresora_fiscal_marca)),
        ),
    )


@router.put("/api/v1/empresa/config-facturacion-fiscal", tags=["Empresa"], response_model=ConfigFacturacionFiscalResponse)
def actualizar_config_facturacion_fiscal(datos: ConfigFacturacionFiscalUpdate, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))) -> ConfigFacturacionFiscalResponse:
    empresa = db.query(Empresa).filter(Empresa.id == usuario_actual.eid).first()
    if not empresa:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada.")
    if datos.modalidad_facturacion is not None:
        empresa.modalidad_facturacion = datos.modalidad_facturacion
    if datos.imprenta_nombre is not None:
        empresa.imprenta_nombre = datos.imprenta_nombre
    if datos.imprenta_rif is not None:
        empresa.imprenta_rif = datos.imprenta_rif
    if datos.imprenta_nro_providencia is not None:
        empresa.imprenta_nro_providencia = datos.imprenta_nro_providencia
    if datos.imprenta_fecha_providencia is not None:
        empresa.imprenta_fecha_providencia = datos.imprenta_fecha_providencia
    if datos.imprenta_control_desde is not None:
        empresa.imprenta_control_desde = datos.imprenta_control_desde
    if datos.imprenta_control_hasta is not None:
        empresa.imprenta_control_hasta = datos.imprenta_control_hasta
    if datos.impresora_fiscal_marca is not None:
        empresa.impresora_fiscal_marca = datos.impresora_fiscal_marca
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No se pudo guardar la configuración de facturación fiscal.")
    marca_actual = normalizar_marca_impresora_fiscal(empresa.impresora_fiscal_marca)
    return ConfigFacturacionFiscalResponse(
        modalidad_facturacion=normalizar_modalidad_facturacion(empresa.modalidad_facturacion),
        imprenta_nombre=empresa.imprenta_nombre,
        imprenta_rif=empresa.imprenta_rif,
        imprenta_nro_providencia=empresa.imprenta_nro_providencia,
        imprenta_fecha_providencia=empresa.imprenta_fecha_providencia,
        imprenta_control_desde=empresa.imprenta_control_desde,
        imprenta_control_hasta=empresa.imprenta_control_hasta,
        impresora_fiscal_marca=marca_actual,
        impresora_fiscal_integracion_automatica=tiene_integracion_automatica(marca_actual),
    )


# ─────────────────────────────────────────────────────────────
# Sincronización Offline-First
# ─────────────────────────────────────────────────────────────
@router.get("/api/v1/saas-config", tags=["SaaS Config"])
def get_saas_config(db: Session = Depends(get_db)):
    row = db.query(SaasConfiguracion).filter(SaasConfiguracion.id == 1).first()
    if not row:
        return {"id": 1, "nombre_proveedor": "", "banco_nombre": "", "banco_codigo": "",
                "rif": "", "telefono_cobro": "", "zelle_email": "", "zelle_titular": ""}
    return {
        "id": row.id, "nombre_proveedor": row.nombre_proveedor, "banco_nombre": row.banco_nombre,
        "banco_codigo": row.banco_codigo, "rif": row.rif, "telefono_cobro": row.telefono_cobro,
        "zelle_email": row.zelle_email, "zelle_titular": row.zelle_titular,
    }


class SaasConfigUpdate(BaseModel):
    nombre_proveedor: str = ""
    banco_nombre: str = ""
    banco_codigo: str = ""
    rif: str = ""
    telefono_cobro: str = ""
    zelle_email: str = ""
    zelle_titular: str = ""


@router.put("/api/v1/saas-config", tags=["SaaS Config"])
def update_saas_config(data: SaasConfigUpdate, db: Session = Depends(get_db)):
    row = db.query(SaasConfiguracion).filter(SaasConfiguracion.id == 1).first()
    if not row:
        row = SaasConfiguracion(id=1, nombre_proveedor="", banco_nombre="", banco_codigo="",
                                rif="", telefono_cobro="", zelle_email="", zelle_titular="")
        db.add(row)
    row.nombre_proveedor = data.nombre_proveedor.strip()
    row.banco_nombre = data.banco_nombre.strip()
    row.banco_codigo = data.banco_codigo.strip()
    row.rif = data.rif.strip()
    row.telefono_cobro = data.telefono_cobro.strip()
    row.zelle_email = data.zelle_email.strip()
    row.zelle_titular = data.zelle_titular.strip()
    db.commit()
    db.refresh(row)
    return {"ok": True}


@router.post("/api/v1/sincronizar", tags=["Sincronización Offline"], response_model=SincronizacionLoteResponse)
def sincronizar_lote(datos: SincronizacionLoteRequest, db: Session = Depends(get_db), usuario_actual: TokenData = Depends(get_current_user)):
    resultados = []
    for item in datos.items:
        nueva_sync = ColaSincronizacion(
            empresa_id=usuario_actual.eid, usuario_id=usuario_actual.usuario_id,
            entidad=item.entidad, datos_json=item.datos_json, estado="pendiente", intentos=1
        )
        db.add(nueva_sync)
        db.commit()
        db.refresh(nueva_sync)
        try:
            payload = json.loads(item.datos_json)
            if item.entidad == "cliente":
                cedula = payload.get("cedula_rif", "").strip()
                if not cedula:
                    raise ValueError("Cédula/RIF es requerida para registrar el cliente.")
                existente = db.query(Cliente).filter(Cliente.empresa_id == usuario_actual.eid, Cliente.cedula_rif == cedula).first()
                if existente:
                    existente.nombre = payload.get("nombre", existente.nombre).strip()
                    existente.telefono = payload.get("telefono", existente.telefono).strip()
                    existente.direccion = payload.get("direccion", existente.direccion).strip()
                    id_remoto = existente.id
                else:
                    nuevo_cliente = Cliente(
                        empresa_id=usuario_actual.eid, nombre=payload.get("nombre", "").strip(),
                        cedula_rif=cedula, telefono=payload.get("telefono", "").strip(),
                        direccion=payload.get("direccion", "").strip()
                    )
                    db.add(nuevo_cliente)
                    db.commit()
                    db.refresh(nuevo_cliente)
                    id_remoto = nuevo_cliente.id
                nueva_sync.estado = "sincronizado"
                db.commit()
                resultados.append(SincronizacionResultado(id_local=item.id_local, sincronizado=True, id_remoto=id_remoto))
            elif item.entidad == "visita":
                cliente_id_local = payload.get("cliente_id")
                cliente_rif = payload.get("cliente_cedula_rif")
                cliente_db = None
                if cliente_rif:
                    cliente_db = db.query(Cliente).filter(Cliente.empresa_id == usuario_actual.eid, Cliente.cedula_rif == cliente_rif).first()
                id_cliente_final = cliente_db.id if cliente_db else cliente_id_local
                if not id_cliente_final:
                    raise ValueError("ID de cliente no especificado o no encontrado en la base de datos.")
                nueva_visita = VisitaCliente(
                    empresa_id=usuario_actual.eid, vendedor_id=usuario_actual.usuario_id,
                    cliente_id=id_cliente_final,
                    fecha_visita=datetime.datetime.strptime(payload.get("fecha_visita")[:10], "%Y-%m-%d").date() if payload.get("fecha_visita") else datetime.date.today(),
                    comentarios=payload.get("comentarios", "").strip()
                )
                db.add(nueva_visita)
                db.commit()
                db.refresh(nueva_visita)
                encuesta_data = payload.get("encuesta")
                if encuesta_data:
                    nueva_encuesta = EncuestaMarketing(
                        visita_id=nueva_visita.id,
                        inventario_cliente=encuesta_data.get("inventario_cliente", ""),
                        rotacion_productos=encuesta_data.get("rotacion_productos", "")
                    )
                    db.add(nueva_encuesta)
                    db.commit()
                nueva_sync.estado = "sincronizado"
                db.commit()
                resultados.append(SincronizacionResultado(id_local=item.id_local, sincronizado=True, id_remoto=nueva_visita.id))
            elif item.entidad == "ticket":
                prod_barras = payload.get("producto_codigo_barras")
                producto_db = None
                if prod_barras:
                    producto_db = db.query(Producto).filter(Producto.empresa_id == usuario_actual.eid, Producto.codigo_barras == prod_barras).first()
                prod_id = producto_db.id if producto_db else payload.get("producto_id")
                if not prod_id:
                    raise ValueError("Producto no encontrado en el catálogo del servidor.")
                cliente_rif = payload.get("cliente_cedula_rif")
                cliente_db = None
                if cliente_rif:
                    cliente_db = db.query(Cliente).filter(Cliente.empresa_id == usuario_actual.eid, Cliente.cedula_rif == cliente_rif).first()
                id_cliente_final = cliente_db.id if cliente_db else payload.get("cliente_id")
                nuevo_ticket = Ticket(
                    empresa_id=usuario_actual.eid, usuario_id=usuario_actual.usuario_id,
                    cliente_id=id_cliente_final, producto_id=prod_id,
                    cantidad=Decimal(str(payload.get("cantidad", 1))),
                    precio_unitario_usd=Decimal(str(payload.get("precio_unitario_usd", 0))),
                    monto_usd=Decimal(str(payload.get("monto_usd", 0))), status=payload.get("status", "procesado")
                )
                db.add(nuevo_ticket)
                db.commit()
                db.refresh(nuevo_ticket)
                producto = db.query(Producto).filter(Producto.id == prod_id).first()
                if producto:
                    producto.stock = max(Decimal("0"), producto.stock - nuevo_ticket.cantidad)
                    db.commit()
                nueva_sync.estado = "sincronizado"
                db.commit()
                resultados.append(SincronizacionResultado(id_local=item.id_local, sincronizado=True, id_remoto=nuevo_ticket.id))
            else:
                raise ValueError(f"Entidad de sincronización no soportada: {item.entidad}")
        except Exception as e:
            db.rollback()
            nueva_sync.estado = "error"
            nueva_sync.error_mensaje = str(e)
            db.commit()
            resultados.append(SincronizacionResultado(id_local=item.id_local, sincronizado=False, error=str(e)))
    return SincronizacionLoteResponse(resultados=resultados)
