"""
Router: SaaS Maestro
Gestión de empresas inquilinas, planes de suscripción y pagos.
Solo accesible por el rol "propietario" (super-admin de 3Q Solutions).
"""
import datetime
import logging
import os

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session
from typing import List

from app.core.security import generar_hash_password, get_current_user, verificar_rol
from app.core.negocio_config import TipoNegocio
from app.db.session import SessionLocal
from app.models.empresa import Empresa
from app.models.usuario import Usuario
from app.models.plan import Plan
from app.models.saas_pago import SaasPago
from app.schemas import (
    RegistroEmpresaAdmin,
    PlanResponse, PlanUpdate,
    EmpresaSaaSResponse, EmpresaSaaSUpdate,
    SaasPagoCreate, SaasPagoResponse,
    TokenData,
)

logger = logging.getLogger("app")

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ─────────────────────────────────────────────────────────────
# Registro inicial de empresa + administrador
# ─────────────────────────────────────────────────────────────
@router.post(
    "/api/v1/auth/registrar-saas",
    tags=["Autenticación SaaS"],
    status_code=status.HTTP_201_CREATED,
)
def registrar_empresa_y_admin(datos: RegistroEmpresaAdmin, db: Session = Depends(get_db)):
    if len(datos.password_admin.encode("utf-8")) > 72:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La contraseña no puede exceder los 72 caracteres.",
        )

    empresa_existente = db.query(Empresa).filter(Empresa.rif == datos.rif_or_cedula).first()
    if empresa_existente:
        raise HTTPException(status_code=400, detail="Esta empresa o RIF ya se encuentra registrada.")

    email_existente = db.query(Usuario).filter(Usuario.email == datos.email_admin).first()
    if email_existente:
        raise HTTPException(status_code=400, detail="El correo electrónico ya está en uso por otro usuario.")

    try:
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
            fecha_inicio=datos.fecha_inicio,
            fecha_vencimiento=datos.fecha_vencimiento,
            status="activo",
        )
        db.add(nueva_empresa)
        db.flush()

        nuevo_usuario = Usuario(
            empresa_id=nueva_empresa.id,
            nombre=datos.nombre_admin,
            email=datos.email_admin,
            telefono=datos.telefono_admin,
            password_hash=generar_hash_password(datos.password_admin[:72]),
            rol="propietario",
            status=True,
        )
        db.add(nuevo_usuario)
        db.commit()
        db.refresh(nueva_empresa)
        db.refresh(nuevo_usuario)

        return {
            "mensaje": "¡SaaS configurado con éxito!",
            "empresa_creada": {
                "id": nueva_empresa.id,
                "nombre": nueva_empresa.nombre_comercial,
                "rif": nueva_empresa.rif,
            },
            "administrador_creado": {
                "id": nuevo_usuario.id,
                "nombre": nuevo_usuario.nombre,
                "correo": nuevo_usuario.email,
                "rol": nuevo_usuario.rol,
            },
        }
    except Exception:
        logger.exception("Error interno al procesar el registro")
        db.rollback()
        raise HTTPException(status_code=500, detail="Error interno al procesar el registro.")


# ─────────────────────────────────────────────────────────────
# CRUD de Empresas
# ─────────────────────────────────────────────────────────────
@router.get(
    "/api/v1/saas/empresas",
    tags=["SaaS Maestro"],
    response_model=List[EmpresaSaaSResponse],
)
def listar_empresas_saas(
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(["propietario"])),
):
    empresas = db.query(Empresa).all()
    resultado = []
    for emp in empresas:
        owner = (
            db.query(Usuario)
            .filter(Usuario.empresa_id == emp.id, Usuario.rol == "propietario")
            .first()
        )
        resultado.append(
            EmpresaSaaSResponse(
                id=emp.id,
                rif=emp.rif,
                nombre_comercial=emp.nombre_comercial,
                nombre_corto=emp.nombre_corto,
                telefono=emp.telefono,
                direccion=emp.direccion,
                tipo_negocio=emp.tipo_negocio,
                plan_id=emp.plan_id,
                sitio_web=emp.sitio_web,
                instagram=emp.instagram,
                facebook=emp.facebook,
                whatsapp=emp.whatsapp,
                tiktok=emp.tiktok,
                x=emp.x,
                modulos_override=emp.modulos_override,
                color_primario=emp.color_primario,
                color_secundario=emp.color_secundario,
                logo_url=emp.logo_url,
                status=emp.status,
                fecha_inicio=emp.fecha_inicio,
                fecha_vencimiento=emp.fecha_vencimiento,
                created_at=emp.created_at,
                owner_id=owner.id if owner else None,
                owner_nombre=owner.nombre if owner else None,
                owner_email=owner.email if owner else None,
                owner_telefono=owner.telefono if owner else None,
            )
        )
    return resultado


@router.put(
    "/api/v1/saas/empresas/{empresa_id}",
    tags=["SaaS Maestro"],
    response_model=EmpresaSaaSResponse,
)
def actualizar_empresa_saas(
    empresa_id: int,
    datos: EmpresaSaaSUpdate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(["propietario"])),
):
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada.")

    empresa.nombre_comercial = datos.nombre_comercial
    empresa.nombre_corto = datos.nombre_corto
    empresa.rif = datos.rif
    empresa.telefono = datos.telefono
    empresa.direccion = datos.direccion
    empresa.tipo_negocio = datos.tipo_negocio
    empresa.plan_id = datos.plan_id
    empresa.sitio_web = datos.sitio_web
    empresa.instagram = datos.instagram
    empresa.facebook = datos.facebook
    empresa.whatsapp = datos.whatsapp
    empresa.tiktok = datos.tiktok
    empresa.x = datos.x
    empresa.modulos_override = datos.modulos_override
    empresa.logo_url = datos.logo_url
    if datos.color_primario:
        empresa.color_primario = datos.color_primario
    if datos.color_secundario:
        empresa.color_secundario = datos.color_secundario
    empresa.status = datos.status
    empresa.fecha_inicio = datos.fecha_inicio
    empresa.fecha_vencimiento = datos.fecha_vencimiento

    owner = (
        db.query(Usuario)
        .filter(Usuario.empresa_id == empresa.id, Usuario.rol == "propietario")
        .first()
    )
    if owner:
        if datos.owner_email != owner.email:
            email_existente = db.query(Usuario).filter(
                Usuario.email == datos.owner_email, Usuario.id != owner.id
            ).first()
            if email_existente:
                raise HTTPException(status_code=400, detail="El correo del propietario ya está en uso.")
        owner.nombre = datos.owner_nombre
        owner.email = datos.owner_email
        owner.telefono = datos.owner_telefono
        if datos.owner_password and datos.owner_password.strip():
            if len(datos.owner_password.encode("utf-8")) > 72:
                raise HTTPException(status_code=400, detail="La contraseña no puede exceder 72 caracteres.")
            owner.password_hash = generar_hash_password(datos.owner_password[:72])

    try:
        db.commit()
        db.refresh(empresa)
        if owner:
            db.refresh(owner)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="No se pudo actualizar la empresa.")

    return EmpresaSaaSResponse(
        id=empresa.id,
        rif=empresa.rif,
        nombre_comercial=empresa.nombre_comercial,
        nombre_corto=empresa.nombre_corto,
        telefono=empresa.telefono,
        direccion=empresa.direccion,
        tipo_negocio=empresa.tipo_negocio,
        plan_id=empresa.plan_id,
        sitio_web=empresa.sitio_web,
        instagram=empresa.instagram,
        facebook=empresa.facebook,
        whatsapp=empresa.whatsapp,
        tiktok=empresa.tiktok,
        x=empresa.x,
        modulos_override=empresa.modulos_override,
        color_primario=empresa.color_primario,
        color_secundario=empresa.color_secundario,
        logo_url=empresa.logo_url,
        status=empresa.status,
        fecha_inicio=empresa.fecha_inicio,
        fecha_vencimiento=empresa.fecha_vencimiento,
        created_at=empresa.created_at,
        owner_id=owner.id if owner else None,
        owner_nombre=owner.nombre if owner else None,
        owner_email=owner.email if owner else None,
        owner_telefono=owner.telefono if owner else None,
    )


@router.delete("/api/v1/saas/empresas/{empresa_id}", tags=["SaaS Maestro"])
def eliminar_empresa_saas(
    empresa_id: int,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(["propietario"])),
):
    if empresa_id == 1:
        raise HTTPException(status_code=400, detail="No se puede eliminar la empresa maestra principal.")

    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada.")

    try:
        db.query(Usuario).filter(Usuario.empresa_id == empresa_id).delete()
        db.query(SaasPago).filter(SaasPago.empresa_id == empresa_id).delete()
        db.delete(empresa)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="No se pudo eliminar la empresa.")

    return {"mensaje": "Empresa eliminada con éxito."}


# ─────────────────────────────────────────────────────────────
# Subir logo de empresa
# ─────────────────────────────────────────────────────────────
@router.post("/api/v1/auth/upload-logo", tags=["SaaS Maestro"])
def subir_logo(
    file: UploadFile = File(...),
    usuario_actual: TokenData = Depends(get_current_user),
):
    import uuid
    import shutil

    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="El archivo debe ser una imagen.")

    ext = os.path.splitext(file.filename)[1] or ".png"
    nuevo_nombre = f"{uuid.uuid4()}{ext}"
    ruta_destino = os.path.join("static", "logos", nuevo_nombre)

    try:
        with open(ruta_destino, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception:
        raise HTTPException(status_code=500, detail="No se pudo guardar la imagen del logo.")

    return {"logo_url": f"http://localhost:8000/static/logos/{nuevo_nombre}"}


# ─────────────────────────────────────────────────────────────
# CRUD de Pagos SaaS
# ─────────────────────────────────────────────────────────────
@router.get(
    "/api/v1/saas/pagos",
    tags=["SaaS Maestro"],
    response_model=List[SaasPagoResponse],
)
def listar_pagos_saas(
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(["propietario"])),
):
    pagos = db.query(SaasPago).order_by(SaasPago.fecha.desc(), SaasPago.created_at.desc()).all()
    resultado = []
    for p in pagos:
        emp = db.query(Empresa).filter(Empresa.id == p.empresa_id).first()
        resultado.append(
            SaasPagoResponse(
                id=p.id,
                empresa_id=p.empresa_id,
                empresa_nombre=emp.nombre_comercial if emp else "Empresa eliminada",
                monto=p.monto,
                metodo=p.metodo,
                referencia=p.referencia,
                comprobante=p.comprobante,
                fecha=p.fecha,
                created_at=p.created_at,
            )
        )
    return resultado


@router.post(
    "/api/v1/saas/pagos",
    tags=["SaaS Maestro"],
    response_model=SaasPagoResponse,
)
def registrar_pago_saas(
    datos: SaasPagoCreate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(["propietario"])),
):
    empresa = db.query(Empresa).filter(Empresa.id == datos.empresa_id).first()
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada.")

    nuevo_pago = SaasPago(
        empresa_id=datos.empresa_id,
        monto=datos.monto,
        metodo=datos.metodo,
        referencia=datos.referencia,
        comprobante=datos.comprobante,
        fecha=datos.fecha,
    )
    db.add(nuevo_pago)

    hoy_str = datetime.date.today().strftime("%Y-%m-%d")
    fecha_base = (
        empresa.fecha_vencimiento
        if (empresa.fecha_vencimiento and empresa.fecha_vencimiento >= hoy_str)
        else hoy_str
    )
    try:
        base_dt = datetime.datetime.strptime(fecha_base, "%Y-%m-%d").date()
    except Exception:
        base_dt = datetime.date.today()

    nueva_venc_dt = base_dt + datetime.timedelta(days=datos.extender_dias or 30)
    empresa.fecha_vencimiento = nueva_venc_dt.strftime("%Y-%m-%d")
    empresa.status = "activo"

    try:
        db.commit()
        db.refresh(nuevo_pago)
        db.refresh(empresa)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="No se pudo registrar el pago.")

    return SaasPagoResponse(
        id=nuevo_pago.id,
        empresa_id=nuevo_pago.empresa_id,
        empresa_nombre=empresa.nombre_comercial,
        monto=nuevo_pago.monto,
        metodo=nuevo_pago.metodo,
        referencia=nuevo_pago.referencia,
        comprobante=nuevo_pago.comprobante,
        fecha=nuevo_pago.fecha,
        created_at=nuevo_pago.created_at,
    )


# ─────────────────────────────────────────────────────────────
# Planes de Suscripción
# ─────────────────────────────────────────────────────────────
@router.get("/api/v1/planes", tags=["Planes"], response_model=list[PlanResponse])
def listar_planes(
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(get_current_user),
):
    return db.query(Plan).order_by(Plan.precio_mensual).all()


@router.put("/api/v1/planes/{plan_id}", tags=["Planes"], response_model=PlanResponse)
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
