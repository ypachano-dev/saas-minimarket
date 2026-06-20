import datetime
import os
from decimal import Decimal
from app.core.security import generar_hash_password, verificar_password, crear_access_token, get_current_user, verificar_rol
from fastapi import FastAPI, Depends, HTTPException, status, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy import func, and_
from sqlalchemy.orm import Session
from typing import Generator, List, Optional

# Importamos la conexión a la base de datos
from app.db.session import SessionLocal
from app.core.config import settings

# Importamos los modelos físicos y el molde de validación
from app.models.empresa import Empresa
from app.models.usuario import Usuario
from app.models.producto import Producto
from app.models.lote import Lote
from app.models.merma import Merma
from app.models.ticket import Ticket
from app.models.cliente import Cliente
from app.models.tasa import TasaCambio
from app.models.peticion_faltante import PeticionFaltante
from app.models.seguimiento_bot import SeguimientoBot
from app.models.proveedor import Proveedor
from app.models.vehiculo import Vehiculo
from app.models.pedido_delivery import PedidoDelivery
from app.models.orden_compra import OrdenCompra, OrdenCompraItem
from app.models.tesoreria import CuentaTesoreria, MovimientoTesoreria, BANCOS_VALIDOS
from app.models.cartera import CuentaPorCobrar, CuentaPorPagar
from app.models.desposte import Desposte, DesposteItem
from app.models.recepcion import RecepcionMercancia, RecepcionMercanciaItem
from app.models.auditoria import AuditoriaInventario, AuditoriaInventarioItem
from app.models.visita import VisitaCliente, EncuestaMarketing
from app.models.orden_venta import OrdenVenta, OrdenVentaItem
from app.models.ruta import RutaVendedor, RutaActividad
from app.core.ai_agent import tiene_agente_ia, consultar_agente
from app.schemas import (
    RegistroEmpresaAdmin, LoginRequest, Token, TokenData,
    ClienteCreate, ClienteUpdate, ClienteResponse,
    ProductoCreate, ProductoUpdate, ProductoResponse, LoteCreate, LoteResponse,
    MermaCreate, MermaResponse, TicketCreate, TicketResponse, VentaResponse,
    TasaCambioUpdate, TasaCambioResponse,
    StockBajoItem, LoteCriticoItem, VentasHoyResponse, ResumenMermasResponse, DashboardResponse,
    PeticionFaltanteCreate, PeticionFaltanteResponse, SeguimientoBotResponse,
    SeguimientoBotCreate, SeguimientoBotUpdate,
    ProveedorCreate, ProveedorResponse, VehiculoCreate, VehiculoResponse, VehiculoUbicacionUpdate,
    UsuarioCreate, UsuarioResponse, TicketPesajeCreate, TicketPesoUpdate, ProcesarPagoTickets,
    PedidoDeliveryCreate, PedidoDeliveryResponse, PedidoDeliveryEstadoUpdate, OrdenCompraCreate, OrdenCompraResponse,
    CuentaTesoreriaCreate, CuentaTesoreriaResponse, MovimientoTesoreriaCreate, MovimientoTesoreriaResponse,
    SaldoPorCuentaItem, ResumenTesoreriaResponse,
    CuentaPorCobrarCreate, CuentaPorCobrarResponse, CuentaPorPagarCreate, CuentaPorPagarResponse,
    AbonoCreate, ResumenCarteraResponse,
    VentaDiariaItem, ProductoTopItem, VentaPorDepartamentoItem, EstadisticasResumenResponse,
    AgenteConsulta, AgenteRespuesta, AloConsulta,
    DesposteCreate, DesposteResponse, DesposteItemResponse,
    RecepcionMercanciaCreate, RecepcionMercanciaResponse, RecepcionMercanciaItemResponse,
    AuditoriaInventarioCreate, AuditoriaInventarioResponse, AuditoriaInventarioItemResponse, ConteoFisicoUpdate,
    StockProyectadoItem,
    UsuarioGpsUpdate, VendedorUbicacionResponse,
    VisitaClienteCreate, VisitaClienteResponse,
    OrdenVentaCreate, OrdenVentaResponse,
    RutaVendedorCreate, RutaVendedorResponse, RutaEstadoUpdate, ActividadAvanceUpdate, RutaActividadResponse
)

# Grupos de roles para el control de accesos (RBAC)
# Gestión: inventario, compras, mermas, tasa de cambio y analítica del negocio
ROLES_GESTION = ["admin", "propietario"]
# Operación de caja: ventas, clientes y consulta de productos para el escáner
# (incluye "repartidor" porque también consume /pedidos y /vehiculos desde su app de delivery)
ROLES_OPERACION = ["cajero", "admin", "propietario", "repartidor", "vendedor"]
# Operadores de departamento (Balanza Digital) que además pueden ejecutar un desposte
ROLES_DESPOSTE = ["admin", "propietario", "carnicero", "verdulero", "charcutero"]
# Lectura de cartera (CxC): gestión + vendedor (necesita ver si el cliente que visita debe, sin poder crear/abonar cuentas)
ROLES_LECTURA_CARTERA = ROLES_GESTION + ["vendedor"]

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    docs_url="/docs",
    redoc_url=None
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Función puente para abrir y cerrar la base de datos automáticamente
def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# 1. Ruta de Sanity Check (movida fuera de "/" para dejar esa ruta libre al frontend)
@app.get("/api/v1/status", tags=["Sanity Check"])
def read_root():
    return {
        "status": "online",
        "sistema": settings.PROJECT_NAME,
        "api_version": "1.0.0",
        "ambiente": "desarrollo_local"
    }

# 2. Registrar Empresa y Administrador en sincronía con tus modelos reales
@app.post("/api/v1/auth/registrar-saas", tags=["Autenticación SaaS"], status_code=status.HTTP_201_CREATED)
def registrar_empresa_y_admin(datos: RegistroEmpresaAdmin, db: Session = Depends(get_db)):

    # Validación: bcrypt soporta como máximo 72 bytes en la contraseña
    if len(datos.password_admin.encode("utf-8")) > 72:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La contraseña no puede exceder los 72 caracteres."
        )

    # Validación: Verificar si el RIF de la empresa ya existe
    empresa_existente = db.query(Empresa).filter(Empresa.rif == datos.rif_or_cedula).first()
    if empresa_existente:
        raise HTTPException(status_code=400, detail="Esta empresa o RIF ya se encuentra registrada.")
        
    # Validación: Verificar si el correo del administrador ya existe
    email_existente = db.query(Usuario).filter(Usuario.email == datos.email_admin).first()
    if email_existente:
        raise HTTPException(status_code=400, detail="El correo electrónico ya está en uso por otro usuario.")

    try:
        # A. Crear la Empresa (Sincronizado con empresa.py)
        nueva_empresa = Empresa(
            nombre_comercial=datos.nombre_empresa,
            rif=datos.rif_or_cedula,
            telefono=datos.telefono,
            direccion=datos.direccion,
            tipo_negocio=datos.tipo_negocio or "minimarket",
            status="activo"
        )
        db.add(nueva_empresa)
        db.flush() # Genera el ID temporal de la empresa

        # B. Crear el Usuario Dueño (Sincronizado con usuario.py)
        nuevo_usuario = Usuario(
            empresa_id=nueva_empresa.id,
            nombre=datos.nombre_admin,             # Ajustado a tu columna 'nombre'
            email=datos.email_admin,
            password_hash=generar_hash_password(datos.password_admin[:72]),   # ¡AHORA SÍ, ENCRIPTADO SEGURO!
            rol="propietario",  # Dueño del negocio: acceso total bajo el esquema RBAC (admin/propietario)
            status=True                           # Ajustado a tu columna 'status' tipo Boolean
        )
        db.add(nuevo_usuario)
        
        # C. Guardar definitivo en el archivo .db
        db.commit()
        db.refresh(nueva_empresa)
        db.refresh(nuevo_usuario)
        
        return {
            "mensaje": "¡SaaS configurado con éxito!",
            "empresa_creada": {
                "id": nueva_empresa.id,
                "nombre": nueva_empresa.nombre_comercial,
                "rif": nueva_empresa.rif
            },
            "administrador_creado": {
                "id": nuevo_usuario.id,
                "nombre": nuevo_usuario.nombre,
                "correo": nuevo_usuario.email,
                "rol": nuevo_usuario.rol
            }
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error interno al procesar el registro: {str(e)}")

# 3. Login: valida credenciales y devuelve un Token JWT con empresa_id y rol
@app.post("/api/v1/auth/login", tags=["Autenticación SaaS"], response_model=Token)
def login(datos: LoginRequest, db: Session = Depends(get_db)):

    usuario = db.query(Usuario).filter(Usuario.email == datos.email).first()

    # bcrypt soporta como máximo 72 bytes; truncamos igual que al registrar
    if not usuario or not verificar_password(datos.password[:72], usuario.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo o contraseña incorrectos."
        )

    if not usuario.status:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Este usuario se encuentra inactivo. Contacte al administrador."
        )

    # El token incluye eid (empresa_id) y rol para mantener el aislamiento Multi-Tenant.
    # Se usa la clave corta 'eid' para reducir el tamaño del string JWT que viaja por la red.
    access_token = crear_access_token(
        data={
            "sub": str(usuario.id),
            "eid": usuario.empresa_id,
            "rol": usuario.rol,
            "email": usuario.email
        }
    )

    return Token(access_token=access_token, token_type="bearer")

# 4. Crear Cliente: la empresa_id se inyecta desde el token; la cédula/RIF no puede
#    repetirse dentro de la misma empresa
@app.post("/api/v1/clientes", tags=["Clientes"], response_model=ClienteResponse, status_code=status.HTTP_201_CREATED)
def crear_cliente(
    datos: ClienteCreate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))
):
    duplicado = db.query(Cliente).filter(
        Cliente.empresa_id == usuario_actual.eid,
        Cliente.cedula == datos.cedula
    ).first()
    if duplicado:
        raise HTTPException(status_code=400, detail="Ya existe un cliente con esa cédula/RIF en su empresa.")

    nuevo_cliente = Cliente(
        empresa_id=usuario_actual.eid,
        **datos.model_dump()
    )

    try:
        db.add(nuevo_cliente)
        db.commit()
        db.refresh(nuevo_cliente)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al registrar el cliente: {str(e)}")

    return nuevo_cliente

# 5. Listar/Buscar Clientes: filtrado obligatorio por empresa_id del token (aislamiento Multi-Tenant).
#    Acepta 'cedula' (coincidencia exacta) y/o 'q' (búsqueda parcial por nombre o cédula).
@app.get("/api/v1/clientes", tags=["Clientes"], response_model=List[ClienteResponse])
def listar_clientes(
    q: Optional[str] = None,
    cedula: Optional[str] = None,
    cliente_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))
):
    query = db.query(Cliente).filter(Cliente.empresa_id == usuario_actual.eid)

    if cliente_id:
        query = query.filter(Cliente.id == cliente_id)

    if cedula:
        query = query.filter(Cliente.cedula == cedula)

    if q:
        termino = f"%{q}%"
        query = query.filter(
            (Cliente.nombre.ilike(termino)) | (Cliente.cedula.ilike(termino))
        )

    return query.offset(skip).limit(limit).all()

# 6. Editar Cliente: primero se confirma que el cliente pertenezca a la empresa del token
#    (si no, 404); si se cambia la cédula/RIF, se valida que no choque con otro cliente
@app.put("/api/v1/clientes/{cliente_id}", tags=["Clientes"], response_model=ClienteResponse)
def actualizar_cliente(
    cliente_id: int,
    datos: ClienteUpdate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))
):
    cliente = db.query(Cliente).filter(
        Cliente.id == cliente_id,
        Cliente.empresa_id == usuario_actual.eid
    ).first()
    if not cliente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El cliente indicado no existe o no pertenece a su empresa."
        )

    datos_actualizados = datos.model_dump(exclude_unset=True)

    nueva_cedula = datos_actualizados.get("cedula")
    if nueva_cedula and nueva_cedula != cliente.cedula:
        duplicado = db.query(Cliente).filter(
            Cliente.empresa_id == usuario_actual.eid,
            Cliente.cedula == nueva_cedula,
            Cliente.id != cliente_id
        ).first()
        if duplicado:
            raise HTTPException(status_code=400, detail="Ya existe otro cliente con esa cédula/RIF en su empresa.")

    for campo, valor in datos_actualizados.items():
        setattr(cliente, campo, valor)

    try:
        db.commit()
        db.refresh(cliente)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al actualizar el cliente: {str(e)}")

    return cliente

# 7. Crear Producto: la empresa_id se inyecta desde el token, nunca desde el body
@app.post("/api/v1/productos", tags=["Productos"], response_model=ProductoResponse, status_code=status.HTTP_201_CREATED)
def crear_producto(
    datos: ProductoCreate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))
):
    nuevo_producto = Producto(
        empresa_id=usuario_actual.eid,
        **datos.model_dump()
    )

    try:
        db.add(nuevo_producto)
        db.commit()
        db.refresh(nuevo_producto)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al crear el producto: {str(e)}")

    return nuevo_producto

# 8. Listar Productos: filtrado obligatorio por empresa_id del token (aislamiento Multi-Tenant)
@app.get("/api/v1/productos", tags=["Productos"], response_model=List[ProductoResponse])
def listar_productos(
    q: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))
):
    stock_subq = (
        db.query(Lote.producto_id, func.coalesce(func.sum(Lote.cantidad_actual), 0).label("stock_total"))
        .filter(Lote.empresa_id == usuario_actual.eid, Lote.status == "activo")
        .group_by(Lote.producto_id)
        .subquery()
    )

    query = (
        db.query(Producto, func.coalesce(stock_subq.c.stock_total, 0))
        .outerjoin(stock_subq, stock_subq.c.producto_id == Producto.id)
        .filter(Producto.empresa_id == usuario_actual.eid)
    )

    if q:
        termino = f"%{q}%"
        query = query.filter(
            (Producto.nombre.ilike(termino)) | (Producto.codigo_interno.ilike(termino))
        )

    rows = query.offset(skip).limit(limit).all()

    resultado = []
    for producto, stock_total in rows:
        item = ProductoResponse.model_validate(producto)
        item.stock_total = float(stock_total)
        resultado.append(item)
    return resultado

# 8b. Editar Producto: permite, entre otras cosas, marcar un producto ya existente como
#     tipo_venta="peso" + factor_merma sin tener que recrearlo (necesario para Desposte)
@app.put("/api/v1/productos/{producto_id}", tags=["Productos"], response_model=ProductoResponse)
def actualizar_producto(
    producto_id: int,
    datos: ProductoUpdate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))
):
    producto = db.query(Producto).filter(
        Producto.id == producto_id,
        Producto.empresa_id == usuario_actual.eid
    ).first()
    if not producto:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado.")

    datos_actualizados = datos.model_dump(exclude_unset=True)
    for campo, valor in datos_actualizados.items():
        setattr(producto, campo, valor)

    try:
        db.commit()
        db.refresh(producto)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al actualizar el producto: {str(e)}")

    respuesta = ProductoResponse.model_validate(producto)
    stock_total = db.query(func.coalesce(func.sum(Lote.cantidad_actual), 0)).filter(
        Lote.producto_id == producto.id, Lote.empresa_id == usuario_actual.eid, Lote.status == "activo"
    ).scalar()
    respuesta.stock_total = float(stock_total)
    return respuesta

# 9. Registrar entrada de Lote: la empresa_id se inyecta desde el token y el producto
#    debe pertenecer a esa misma empresa
@app.post("/api/v1/lotes", tags=["Lotes"], response_model=LoteResponse, status_code=status.HTTP_201_CREATED)
def crear_lote(
    datos: LoteCreate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))
):
    # Validación Multi-Tenant: el producto debe existir y pertenecer a la empresa del usuario
    producto = db.query(Producto).filter(
        Producto.id == datos.producto_id,
        Producto.empresa_id == usuario_actual.eid
    ).first()
    if not producto:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El producto indicado no existe o no pertenece a su empresa."
        )

    nuevo_lote = Lote(
        empresa_id=usuario_actual.eid,
        producto_id=datos.producto_id,
        codigo_lote=datos.codigo_lote,
        cantidad_inicial=datos.cantidad_inicial,
        cantidad_actual=datos.cantidad_inicial,  # Al ingresar, lo actual inicia igual a lo inicial
        fecha_ingreso=datos.fecha_ingreso or datetime.date.today(),
        fecha_vencimiento=datos.fecha_vencimiento
    )

    try:
        db.add(nuevo_lote)
        db.commit()
        db.refresh(nuevo_lote)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al registrar el lote: {str(e)}")

    return nuevo_lote

# 10. Listar Lotes activos: filtrado obligatorio por empresa_id del token (aislamiento Multi-Tenant)
@app.get("/api/v1/lotes", tags=["Lotes"], response_model=List[LoteResponse])
def listar_lotes(
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(get_current_user)
):
    return db.query(Lote).filter(
        Lote.empresa_id == usuario_actual.eid,
        Lote.status == "activo"
    ).all()

# 10b. Registrar Recepción de Mercancía (Ingreso/Descarga): crea un Lote por cada renglón
#      recibido y, si viene ligada a una Orden de Compra, la marca como Recibida.
@app.post("/api/v1/almacen/recepciones", tags=["Almacén"], response_model=RecepcionMercanciaResponse, status_code=status.HTTP_201_CREATED)
def crear_recepcion_mercancia(
    datos: RecepcionMercanciaCreate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))
):
    if not datos.items:
        raise HTTPException(status_code=400, detail="La recepción debe incluir al menos un producto.")

    proveedor = None
    if datos.proveedor_id is not None:
        proveedor = db.query(Proveedor).filter(
            Proveedor.id == datos.proveedor_id, Proveedor.empresa_id == usuario_actual.eid
        ).first()
        if not proveedor:
            raise HTTPException(status_code=404, detail="El proveedor indicado no existe o no pertenece a su empresa.")

    orden_compra = None
    if datos.orden_compra_id is not None:
        orden_compra = db.query(OrdenCompra).filter(
            OrdenCompra.id == datos.orden_compra_id, OrdenCompra.empresa_id == usuario_actual.eid
        ).first()
        if not orden_compra:
            raise HTTPException(status_code=404, detail="La orden de compra indicada no existe o no pertenece a su empresa.")

    try:
        nueva_recepcion = RecepcionMercancia(
            empresa_id=usuario_actual.eid,
            proveedor_id=datos.proveedor_id,
            orden_compra_id=datos.orden_compra_id,
            usuario_id=usuario_actual.usuario_id,
            fecha=datetime.date.today(),
            notas=datos.notas
        )
        db.add(nueva_recepcion)
        db.flush()  # genera nueva_recepcion.id

        items_creados: list[RecepcionMercanciaItem] = []
        for item in datos.items:
            if item.cantidad <= 0:
                raise HTTPException(status_code=400, detail="La cantidad de cada renglón debe ser mayor a cero.")

            producto = db.query(Producto).filter(
                Producto.id == item.producto_id, Producto.empresa_id == usuario_actual.eid
            ).first()
            if not producto:
                raise HTTPException(status_code=404, detail=f"El producto {item.producto_id} no existe o no pertenece a su empresa.")

            nuevo_lote = Lote(
                empresa_id=usuario_actual.eid,
                producto_id=producto.id,
                codigo_lote=item.codigo_lote,
                cantidad_inicial=item.cantidad,
                cantidad_actual=item.cantidad,
                fecha_ingreso=datetime.date.today(),
                fecha_vencimiento=item.fecha_vencimiento
            )
            db.add(nuevo_lote)
            db.flush()  # genera nuevo_lote.id

            # Última costo recibido gana: mantiene el costo de referencia del producto actualizado
            producto.costo_usd = item.costo_unitario

            nuevo_item = RecepcionMercanciaItem(
                recepcion_id=nueva_recepcion.id,
                producto_id=producto.id,
                lote_id=nuevo_lote.id,
                cantidad=item.cantidad,
                costo_unitario=item.costo_unitario
            )
            db.add(nuevo_item)
            items_creados.append(nuevo_item)

        if orden_compra is not None:
            orden_compra.estatus = "Recibido"

        db.commit()
        db.refresh(nueva_recepcion)
        for item in items_creados:
            db.refresh(item)

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al registrar la recepción de mercancía: {str(e)}")

    return RecepcionMercanciaResponse(
        id=nueva_recepcion.id,
        empresa_id=nueva_recepcion.empresa_id,
        proveedor_id=nueva_recepcion.proveedor_id,
        proveedor_nombre=proveedor.nombre if proveedor else None,
        orden_compra_id=nueva_recepcion.orden_compra_id,
        fecha=nueva_recepcion.fecha,
        notas=nueva_recepcion.notas,
        created_at=nueva_recepcion.created_at,
        items=[RecepcionMercanciaItemResponse.model_validate(item) for item in items_creados]
    )

# 10c. Listar Recepciones de Mercancía: historial filtrado por empresa
@app.get("/api/v1/almacen/recepciones", tags=["Almacén"], response_model=List[RecepcionMercanciaResponse])
def listar_recepciones_mercancia(
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))
):
    recepciones = (
        db.query(RecepcionMercancia)
        .filter(RecepcionMercancia.empresa_id == usuario_actual.eid)
        .order_by(RecepcionMercancia.created_at.desc())
        .all()
    )
    resultado = []
    for r in recepciones:
        items = db.query(RecepcionMercanciaItem).filter(RecepcionMercanciaItem.recepcion_id == r.id).all()
        proveedor = db.query(Proveedor).filter(Proveedor.id == r.proveedor_id).first() if r.proveedor_id else None
        resultado.append(RecepcionMercanciaResponse(
            id=r.id, empresa_id=r.empresa_id, proveedor_id=r.proveedor_id,
            proveedor_nombre=proveedor.nombre if proveedor else None,
            orden_compra_id=r.orden_compra_id, fecha=r.fecha, notas=r.notas, created_at=r.created_at,
            items=[RecepcionMercanciaItemResponse.model_validate(item) for item in items]
        ))
    return resultado

def _stock_total_por_producto(db: Session, empresa_id: int) -> dict[int, Decimal]:
    """Mapa producto_id -> stock_total (suma de lotes activos). Mismo patrón usado en
    el Dashboard para 'Alertas de Stock Bajo'."""
    filas = (
        db.query(Producto.id, func.coalesce(func.sum(Lote.cantidad_actual), 0).label("stock_total"))
        .outerjoin(Lote, and_(Lote.producto_id == Producto.id, Lote.empresa_id == empresa_id, Lote.status == "activo"))
        .filter(Producto.empresa_id == empresa_id, Producto.status == True)
        .group_by(Producto.id)
        .all()
    )
    return {fila.id: Decimal(str(fila.stock_total)) for fila in filas}

def _serializar_auditoria(db: Session, auditoria: AuditoriaInventario) -> AuditoriaInventarioResponse:
    items = db.query(AuditoriaInventarioItem).filter(AuditoriaInventarioItem.auditoria_id == auditoria.id).all()
    productos = {p.id: p.nombre for p in db.query(Producto.id, Producto.nombre).filter(
        Producto.id.in_([i.producto_id for i in items])
    ).all()} if items else {}
    return AuditoriaInventarioResponse(
        id=auditoria.id, empresa_id=auditoria.empresa_id, fecha=auditoria.fecha,
        status=auditoria.status, notas=auditoria.notas, created_at=auditoria.created_at,
        items=[
            AuditoriaInventarioItemResponse(
                id=i.id, producto_id=i.producto_id, producto_nombre=productos.get(i.producto_id),
                cantidad_sistema=i.cantidad_sistema, cantidad_fisica=i.cantidad_fisica, diferencia=i.diferencia
            )
            for i in items
        ]
    )

# 11a. Abrir Auditoría de Inventario: toma una foto del stock de sistema (todos los productos
#      activos, o solo los de una línea/departamento) para luego compararla con el conteo físico
@app.post("/api/v1/almacen/auditorias", tags=["Almacén"], response_model=AuditoriaInventarioResponse, status_code=status.HTTP_201_CREATED)
def crear_auditoria_inventario(
    datos: AuditoriaInventarioCreate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))
):
    empresa_id = usuario_actual.eid
    stock_por_producto = _stock_total_por_producto(db, empresa_id)

    query_productos = db.query(Producto).filter(Producto.empresa_id == empresa_id, Producto.status == True)
    if datos.linea:
        query_productos = query_productos.filter(Producto.linea == datos.linea)
    productos = query_productos.all()

    if not productos:
        raise HTTPException(status_code=400, detail="No hay productos activos para auditar con ese filtro.")

    try:
        nueva_auditoria = AuditoriaInventario(
            empresa_id=empresa_id,
            usuario_id=usuario_actual.usuario_id,
            fecha=datetime.date.today(),
            status="abierta",
            notas=datos.notas
        )
        db.add(nueva_auditoria)
        db.flush()

        for producto in productos:
            db.add(AuditoriaInventarioItem(
                auditoria_id=nueva_auditoria.id,
                producto_id=producto.id,
                cantidad_sistema=stock_por_producto.get(producto.id, Decimal("0")),
                cantidad_fisica=None,
                diferencia=None
            ))

        db.commit()
        db.refresh(nueva_auditoria)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al abrir la auditoría: {str(e)}")

    return _serializar_auditoria(db, nueva_auditoria)

# 11b. Listar Auditorías de Inventario (historial)
@app.get("/api/v1/almacen/auditorias", tags=["Almacén"], response_model=List[AuditoriaInventarioResponse])
def listar_auditorias_inventario(
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))
):
    auditorias = db.query(AuditoriaInventario).filter(
        AuditoriaInventario.empresa_id == usuario_actual.eid
    ).order_by(AuditoriaInventario.created_at.desc()).all()
    return [_serializar_auditoria(db, a) for a in auditorias]

# 11c. Obtener el detalle de una Auditoría de Inventario
@app.get("/api/v1/almacen/auditorias/{auditoria_id}", tags=["Almacén"], response_model=AuditoriaInventarioResponse)
def obtener_auditoria_inventario(
    auditoria_id: int,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))
):
    auditoria = db.query(AuditoriaInventario).filter(
        AuditoriaInventario.id == auditoria_id, AuditoriaInventario.empresa_id == usuario_actual.eid
    ).first()
    if not auditoria:
        raise HTTPException(status_code=404, detail="Auditoría no encontrada.")
    return _serializar_auditoria(db, auditoria)

# 11d. Registrar el conteo físico de un renglón de la auditoría (permite contar incrementalmente)
@app.put("/api/v1/almacen/auditorias/{auditoria_id}/items/{item_id}", tags=["Almacén"], response_model=AuditoriaInventarioItemResponse)
def registrar_conteo_fisico(
    auditoria_id: int,
    item_id: int,
    datos: ConteoFisicoUpdate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))
):
    auditoria = db.query(AuditoriaInventario).filter(
        AuditoriaInventario.id == auditoria_id, AuditoriaInventario.empresa_id == usuario_actual.eid
    ).first()
    if not auditoria:
        raise HTTPException(status_code=404, detail="Auditoría no encontrada.")
    if auditoria.status != "abierta":
        raise HTTPException(status_code=400, detail="Esta auditoría ya está cerrada y no admite más conteos.")

    item = db.query(AuditoriaInventarioItem).filter(
        AuditoriaInventarioItem.id == item_id, AuditoriaInventarioItem.auditoria_id == auditoria_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Renglón de auditoría no encontrado.")
    if datos.cantidad_fisica < 0:
        raise HTTPException(status_code=400, detail="La cantidad física no puede ser negativa.")

    item.cantidad_fisica = datos.cantidad_fisica
    item.diferencia = datos.cantidad_fisica - item.cantidad_sistema

    try:
        db.commit()
        db.refresh(item)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al registrar el conteo: {str(e)}")

    producto = db.query(Producto).filter(Producto.id == item.producto_id).first()
    return AuditoriaInventarioItemResponse(
        id=item.id, producto_id=item.producto_id, producto_nombre=producto.nombre if producto else None,
        cantidad_sistema=item.cantidad_sistema, cantidad_fisica=item.cantidad_fisica, diferencia=item.diferencia
    )

# 11e. Cerrar Auditoría: por cada renglón contado con diferencia != 0, ajusta el inventario real
#      (faltante -> se descuenta FEFO de los lotes activos; sobrante -> se crea un Lote de ajuste)
@app.post("/api/v1/almacen/auditorias/{auditoria_id}/cerrar", tags=["Almacén"], response_model=AuditoriaInventarioResponse)
def cerrar_auditoria_inventario(
    auditoria_id: int,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))
):
    auditoria = db.query(AuditoriaInventario).filter(
        AuditoriaInventario.id == auditoria_id, AuditoriaInventario.empresa_id == usuario_actual.eid
    ).first()
    if not auditoria:
        raise HTTPException(status_code=404, detail="Auditoría no encontrada.")
    if auditoria.status != "abierta":
        raise HTTPException(status_code=400, detail="Esta auditoría ya está cerrada.")

    items = db.query(AuditoriaInventarioItem).filter(AuditoriaInventarioItem.auditoria_id == auditoria_id).all()

    try:
        for item in items:
            if item.cantidad_fisica is None or item.diferencia is None or item.diferencia == 0:
                continue

            if item.diferencia > 0:
                # Sobrante: se crea un Lote de ajuste con la diferencia encontrada
                db.add(Lote(
                    empresa_id=auditoria.empresa_id,
                    producto_id=item.producto_id,
                    codigo_lote=f"AJUSTE-AUD-{auditoria.id}",
                    cantidad_inicial=item.diferencia,
                    cantidad_actual=item.diferencia,
                    fecha_ingreso=datetime.date.today(),
                    fecha_vencimiento=datetime.date.today() + datetime.timedelta(days=30)
                ))
            else:
                # Faltante: se descuenta FEFO de los lotes activos, igual que una venta/merma
                restante = -item.diferencia
                lotes = db.query(Lote).filter(
                    Lote.empresa_id == auditoria.empresa_id,
                    Lote.producto_id == item.producto_id,
                    Lote.status == "activo",
                    Lote.cantidad_actual > 0
                ).order_by(Lote.fecha_vencimiento.asc(), Lote.fecha_ingreso.asc()).all()

                for lote in lotes:
                    if restante <= 0:
                        break
                    descuento = min(lote.cantidad_actual, restante)
                    lote.cantidad_actual -= descuento
                    restante -= descuento
                    if lote.cantidad_actual == 0:
                        lote.status = "agotado"
                # Si restante > 0 aquí, el sistema nunca tuvo registrado ese stock realmente;
                # se deja constancia en la auditoría (diferencia) sin forzar lotes a negativo.

        auditoria.status = "cerrada"
        db.commit()
        db.refresh(auditoria)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al cerrar la auditoría: {str(e)}")

    return _serializar_auditoria(db, auditoria)

# 11f. Informe de Stock Actual y Proyectado: para cada producto activo, calcula la velocidad
#      de venta real de los últimos 30 días (mismo patrón que 'top_productos' en Estadísticas)
#      y proyecta días restantes, fecha estimada de agotamiento y una sugerencia de reorden.
@app.get("/api/v1/almacen/proyeccion", tags=["Almacén"], response_model=List[StockProyectadoItem])
def proyeccion_stock(
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))
):
    empresa_id = usuario_actual.eid
    hoy = datetime.date.today()
    hace_30_dias = hoy - datetime.timedelta(days=30)
    DIAS_COBERTURA_REORDEN = 7

    stock_por_producto = _stock_total_por_producto(db, empresa_id)

    ventas_30d = (
        db.query(Ticket.producto_id, func.coalesce(func.sum(Ticket.peso), 0).label("cantidad"))
        .filter(Ticket.empresa_id == empresa_id, Ticket.status == "procesado", func.date(Ticket.created_at) >= hace_30_dias)
        .group_by(Ticket.producto_id)
        .all()
    )
    velocidad_por_producto = {fila.producto_id: Decimal(str(fila.cantidad)) / Decimal("30") for fila in ventas_30d}

    productos = db.query(Producto).filter(Producto.empresa_id == empresa_id, Producto.status == True).all()

    resultado = []
    for producto in productos:
        stock_actual = stock_por_producto.get(producto.id, Decimal("0"))
        velocidad = velocidad_por_producto.get(producto.id, Decimal("0"))

        dias_restantes = float(stock_actual / velocidad) if velocidad > 0 else None
        fecha_agotamiento = hoy + datetime.timedelta(days=dias_restantes) if dias_restantes is not None else None

        if (dias_restantes is not None and dias_restantes <= 3) or stock_actual <= producto.stock_minimo:
            alerta = "critico"
        elif dias_restantes is not None and dias_restantes <= 7:
            alerta = "atencion"
        else:
            alerta = "ok"

        sugerencia = max(Decimal("0"), velocidad * DIAS_COBERTURA_REORDEN - stock_actual).quantize(Decimal("0.001"))

        resultado.append(StockProyectadoItem(
            producto_id=producto.id,
            codigo_interno=producto.codigo_interno,
            nombre=producto.nombre,
            stock_actual=stock_actual,
            velocidad_diaria=velocidad.quantize(Decimal("0.001")),
            dias_restantes=round(dias_restantes, 1) if dias_restantes is not None else None,
            fecha_agotamiento_estimada=fecha_agotamiento,
            alerta=alerta,
            sugerencia_reorden=sugerencia
        ))

    # Más urgente primero: sin ventas (dias_restantes None) al final
    resultado.sort(key=lambda r: (r.dias_restantes is None, r.dias_restantes if r.dias_restantes is not None else 0))
    return resultado

# 11. Registrar Merma: la empresa_id y usuario_id se inyectan desde el token, el lote
#    debe pertenecer a esa misma empresa y se descuenta de su cantidad_actual
@app.post("/api/v1/mermas", tags=["Mermas"], response_model=MermaResponse, status_code=status.HTTP_201_CREATED)
def crear_merma(
    datos: MermaCreate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))
):
    # Validación Multi-Tenant: el lote debe existir y pertenecer a la empresa del usuario
    lote = db.query(Lote).filter(
        Lote.id == datos.lote_id,
        Lote.empresa_id == usuario_actual.eid
    ).first()
    if not lote:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El lote indicado no existe o no pertenece a su empresa."
        )

    if datos.cantidad <= 0:
        raise HTTPException(status_code=400, detail="La cantidad de la merma debe ser mayor a cero.")

    if datos.cantidad > lote.cantidad_actual:
        raise HTTPException(
            status_code=400,
            detail="La cantidad de la merma no puede ser mayor a la cantidad actual del lote."
        )

    nueva_merma = Merma(
        empresa_id=usuario_actual.eid,
        usuario_id=usuario_actual.usuario_id,
        producto_id=lote.producto_id,
        lote_id=lote.id,
        cantidad=datos.cantidad,
        motivo=datos.motivo,
        observaciones=datos.observaciones
    )

    # Descontamos la cantidad mermada del lote de origen
    lote.cantidad_actual -= datos.cantidad

    try:
        db.add(nueva_merma)
        db.commit()
        db.refresh(nueva_merma)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al registrar la merma: {str(e)}")

    return nueva_merma

# 12. Listar Mermas: filtrado obligatorio por empresa_id del token (aislamiento Multi-Tenant)
@app.get("/api/v1/mermas", tags=["Mermas"], response_model=List[MermaResponse])
def listar_mermas(
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))
):
    return db.query(Merma).filter(Merma.empresa_id == usuario_actual.eid).all()

# 12b. Registrar Desposte: consume peso del producto origen (ej. Pollo Entero) usando FEFO,
#      y por cada corte resultante crea un Lote nuevo del producto destino. La merma real
#      (lo que se pierde en hueso, grasa, sangre, etc.) siempre se recalcula en el servidor.
@app.post("/api/v1/desposte", tags=["Desposte"], response_model=DesposteResponse, status_code=status.HTTP_201_CREATED)
def crear_desposte(
    datos: DesposteCreate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_DESPOSTE))
):
    if datos.peso_origen <= 0:
        raise HTTPException(status_code=400, detail="El peso de origen debe ser mayor a cero.")
    if not datos.items_destino:
        raise HTTPException(status_code=400, detail="Debe registrar al menos un corte resultante.")

    producto_origen = db.query(Producto).filter(
        Producto.id == datos.producto_origen_id,
        Producto.empresa_id == usuario_actual.eid
    ).first()
    if not producto_origen:
        raise HTTPException(status_code=404, detail="El producto de origen no existe o no pertenece a su empresa.")

    peso_total_destino = sum((item.peso for item in datos.items_destino), Decimal("0"))
    if peso_total_destino > datos.peso_origen:
        raise HTTPException(
            status_code=400,
            detail="La suma de los pesos de los cortes resultantes no puede superar el peso de origen."
        )
    if any(item.peso <= 0 for item in datos.items_destino):
        raise HTTPException(status_code=400, detail="El peso de cada corte resultante debe ser mayor a cero.")

    try:
        # 1. Consumir el peso de origen de los lotes activos (FEFO: vencen primero, ingresaron primero)
        lotes_origen = db.query(Lote).filter(
            Lote.empresa_id == usuario_actual.eid,
            Lote.producto_id == producto_origen.id,
            Lote.status == "activo",
            Lote.cantidad_actual > 0
        ).order_by(Lote.fecha_vencimiento.asc(), Lote.fecha_ingreso.asc()).all()

        stock_disponible = sum((lote.cantidad_actual for lote in lotes_origen), Decimal("0"))
        if stock_disponible < datos.peso_origen:
            raise HTTPException(
                status_code=400,
                detail=f"Stock insuficiente de '{producto_origen.nombre}'. Disponible: {stock_disponible}, solicitado: {datos.peso_origen}"
            )

        fecha_vencimiento_heredada = lotes_origen[0].fecha_vencimiento if lotes_origen else (datetime.date.today() + datetime.timedelta(days=7))

        restante = datos.peso_origen
        for lote in lotes_origen:
            if restante <= 0:
                break
            descuento = min(lote.cantidad_actual, restante)
            lote.cantidad_actual -= descuento
            restante -= descuento
            if lote.cantidad_actual == 0:
                lote.status = "agotado"

        # 2. Calcular la merma real en el servidor (nunca confiar en el valor enviado por el cliente)
        merma_real = (datos.peso_origen - peso_total_destino).quantize(Decimal("0.001"))

        nuevo_desposte = Desposte(
            empresa_id=usuario_actual.eid,
            usuario_id=usuario_actual.usuario_id,
            producto_origen_id=producto_origen.id,
            peso_origen=datos.peso_origen,
            peso_total_destino=peso_total_destino,
            merma_peso=merma_real,
            observaciones=datos.observaciones
        )
        db.add(nuevo_desposte)
        db.flush()  # genera nuevo_desposte.id

        # 3. Por cada corte resultante: validar el producto y crear un Lote nuevo con ese peso
        items_creados: list[DesposteItem] = []
        for item in datos.items_destino:
            producto_destino = db.query(Producto).filter(
                Producto.id == item.producto_id,
                Producto.empresa_id == usuario_actual.eid
            ).first()
            if not producto_destino:
                raise HTTPException(status_code=404, detail=f"El producto destino {item.producto_id} no existe o no pertenece a su empresa.")

            nuevo_lote = Lote(
                empresa_id=usuario_actual.eid,
                producto_id=producto_destino.id,
                codigo_lote=f"DESPOSTE-{nuevo_desposte.id}",
                cantidad_inicial=item.peso,
                cantidad_actual=item.peso,
                fecha_ingreso=datetime.date.today(),
                fecha_vencimiento=fecha_vencimiento_heredada
            )
            db.add(nuevo_lote)
            db.flush()  # genera nuevo_lote.id

            nuevo_item = DesposteItem(
                desposte_id=nuevo_desposte.id,
                producto_id=producto_destino.id,
                lote_id=nuevo_lote.id,
                peso=item.peso
            )
            db.add(nuevo_item)
            items_creados.append(nuevo_item)

        db.commit()
        db.refresh(nuevo_desposte)
        for item in items_creados:
            db.refresh(item)

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al registrar el desposte: {str(e)}")

    return DesposteResponse(
        id=nuevo_desposte.id,
        empresa_id=nuevo_desposte.empresa_id,
        producto_origen_id=nuevo_desposte.producto_origen_id,
        peso_origen=nuevo_desposte.peso_origen,
        peso_total_destino=nuevo_desposte.peso_total_destino,
        merma_peso=nuevo_desposte.merma_peso,
        observaciones=nuevo_desposte.observaciones,
        created_at=nuevo_desposte.created_at,
        items=[DesposteItemResponse.model_validate(item) for item in items_creados]
    )

# 12c. Listar Desposte: historial de operaciones de desposte (filtrado por empresa)
@app.get("/api/v1/desposte", tags=["Desposte"], response_model=List[DesposteResponse])
def listar_desposte(
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))
):
    desp = (
        db.query(Desposte)
        .filter(Desposte.empresa_id == usuario_actual.eid)
        .order_by(Desposte.created_at.desc())
        .all()
    )
    resultado = []
    for d in desp:
        items = db.query(DesposteItem).filter(DesposteItem.desposte_id == d.id).all()
        resultado.append(DesposteResponse(
            id=d.id, empresa_id=d.empresa_id, producto_origen_id=d.producto_origen_id,
            peso_origen=d.peso_origen, peso_total_destino=d.peso_total_destino, merma_peso=d.merma_peso,
            observaciones=d.observaciones, created_at=d.created_at,
            items=[DesposteItemResponse.model_validate(item) for item in items]
        ))
    return resultado

# 13. Actualizar la tasa BCV de la empresa (Bolívares por Dólar). Si no existe, se crea.
@app.put("/api/v1/tasa", tags=["Tasa de Cambio"], response_model=TasaCambioResponse)
def actualizar_tasa(
    datos: TasaCambioUpdate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))
):
    if datos.valor_bcv <= 0:
        raise HTTPException(status_code=400, detail="El valor de la tasa BCV debe ser mayor a cero.")
    if datos.valor_eur is not None and datos.valor_eur <= 0:
        raise HTTPException(status_code=400, detail="El valor de la tasa Euro debe ser mayor a cero.")

    tasa = db.query(TasaCambio).filter(TasaCambio.empresa_id == usuario_actual.eid).first()
    ahora = datetime.datetime.now(datetime.timezone.utc)

    if tasa:
        tasa.valor_bcv = datos.valor_bcv
        if datos.valor_eur is not None:
            tasa.valor_eur = datos.valor_eur
        tasa.fecha_actualizacion = ahora
    else:
        tasa = TasaCambio(
            empresa_id=usuario_actual.eid,
            valor_bcv=datos.valor_bcv,
            valor_eur=datos.valor_eur,
            fecha_actualizacion=ahora
        )
        db.add(tasa)

    try:
        db.commit()
        db.refresh(tasa)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al actualizar la tasa de cambio: {str(e)}")

    return tasa

# 13b. Obtener la tasa BCV de la empresa (se actualiza automáticamente si es vieja)
@app.get("/api/v1/tasa", tags=["Tasa de Cambio"], response_model=TasaCambioResponse)
def obtener_tasa(
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(get_current_user)
):
    tasa = db.query(TasaCambio).filter(TasaCambio.empresa_id == usuario_actual.eid).first()
    ahora = datetime.datetime.now(datetime.timezone.utc)
    
    actualizar = False
    if not tasa:
        actualizar = True
    elif tasa.valor_eur is None:
        # Tasa creada antes de soportar Euro: la completamos aunque el BCV no esté vencido
        actualizar = True
    elif tasa.fecha_actualizacion:
        fecha_act = tasa.fecha_actualizacion
        if fecha_act.tzinfo is None:
            fecha_act = fecha_act.replace(tzinfo=datetime.timezone.utc)
        if (ahora - fecha_act).total_seconds() > 4 * 3600:
            actualizar = True

    if actualizar:
        valor_usd = Decimal("602.33")
        valor_eur = Decimal("650.00")
        import urllib.request, json

        try:
            req = urllib.request.Request('https://ve.dolarapi.com/v1/dolares/oficial', headers={'User-Agent': 'Mozilla/5.0'})
            res_data = json.loads(urllib.request.urlopen(req, timeout=3).read().decode('utf-8'))
            promedio = res_data.get("promedio")
            if promedio:
                valor_usd = Decimal(str(round(promedio, 2)))
        except Exception:
            if tasa:
                valor_usd = tasa.valor_bcv

        try:
            req_eur = urllib.request.Request('https://ve.dolarapi.com/v1/euros/oficial', headers={'User-Agent': 'Mozilla/5.0'})
            res_eur = json.loads(urllib.request.urlopen(req_eur, timeout=3).read().decode('utf-8'))
            promedio_eur = res_eur.get("promedio")
            if promedio_eur:
                valor_eur = Decimal(str(round(promedio_eur, 2)))
        except Exception:
            if tasa and tasa.valor_eur is not None:
                valor_eur = tasa.valor_eur

        if not tasa:
            tasa = TasaCambio(empresa_id=usuario_actual.eid, valor_bcv=valor_usd, valor_eur=valor_eur)
            db.add(tasa)
        else:
            tasa.valor_bcv = valor_usd
            tasa.valor_eur = valor_eur
            tasa.fecha_actualizacion = ahora
        try:
            db.commit()
            db.refresh(tasa)
        except Exception:
            db.rollback()

    return tasa

# 14. Registrar Venta (Ticket): la empresa_id y usuario_id se inyectan desde el token.
#     Por cada producto se valida el stock disponible (suma de lotes activos) y se
#     descuenta aplicando FEFO/FIFO: primero los lotes que vencen antes / ingresaron primero.
@app.post("/api/v1/tickets", tags=["Ventas"], response_model=VentaResponse, status_code=status.HTTP_201_CREATED)
def crear_ticket(
    datos: TicketCreate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))
):
    if not datos.items:
        raise HTTPException(status_code=400, detail="La venta debe incluir al menos un producto.")

    # Validación Multi-Tenant: el cliente debe pertenecer a la empresa del usuario
    cliente = db.query(Cliente).filter(
        Cliente.id == datos.cliente_id,
        Cliente.empresa_id == usuario_actual.eid
    ).first()
    if not cliente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El cliente indicado no existe o no pertenece a su empresa."
        )

    # La tasa BCV de la empresa es obligatoria para calcular los montos en Bolívares
    tasa = db.query(TasaCambio).filter(TasaCambio.empresa_id == usuario_actual.eid).first()
    if not tasa:
        raise HTTPException(
            status_code=400,
            detail="Debe configurar la tasa de cambio BCV de su empresa (PUT /api/v1/tasa) antes de registrar ventas."
        )
    tasa_bcv = tasa.valor_bcv

    tickets_creados: list[tuple[Ticket, Decimal]] = []
    total_usd = Decimal("0.00")
    total_ves = Decimal("0.00")

    try:
        for item in datos.items:
            if item.peso <= 0:
                raise HTTPException(status_code=400, detail="La cantidad/peso de cada producto debe ser mayor a cero.")

            # Validación Multi-Tenant: el producto debe pertenecer a la empresa del usuario
            producto = db.query(Producto).filter(
                Producto.id == item.producto_id,
                Producto.empresa_id == usuario_actual.eid
            ).first()
            if not producto:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"El producto {item.producto_id} no existe o no pertenece a su empresa."
                )

            # Lotes activos con stock, ordenados FEFO (vencen primero) y FIFO (ingresaron primero)
            lotes = db.query(Lote).filter(
                Lote.empresa_id == usuario_actual.eid,
                Lote.producto_id == item.producto_id,
                Lote.status == "activo",
                Lote.cantidad_actual > 0
            ).order_by(Lote.fecha_vencimiento.asc(), Lote.fecha_ingreso.asc()).all()

            stock_disponible = sum((lote.cantidad_actual for lote in lotes), Decimal("0"))
            if stock_disponible < item.peso:
                raise HTTPException(
                    status_code=400,
                    detail=f"Stock insuficiente para '{producto.nombre}'. Disponible: {stock_disponible}, solicitado: {item.peso}"
                )

            # Descuento FIFO/FEFO: se va consumiendo lote por lote hasta cubrir lo vendido
            restante = item.peso
            for lote in lotes:
                if restante <= 0:
                    break
                descuento = min(lote.cantidad_actual, restante)
                lote.cantidad_actual -= descuento
                restante -= descuento
                if lote.cantidad_actual == 0:
                    lote.status = "agotado"

            monto_usd = (item.peso * producto.precio_1_detalle).quantize(Decimal("0.01"))
            monto_ves = (monto_usd * tasa_bcv).quantize(Decimal("0.01"))

            nuevo_ticket = Ticket(
                empresa_id=usuario_actual.eid,
                usuario_id=usuario_actual.usuario_id,
                producto_id=item.producto_id,
                cliente_id=datos.cliente_id,
                peso=item.peso,
                monto_usd=monto_usd,
                status="procesado"
            )
            db.add(nuevo_ticket)
            tickets_creados.append((nuevo_ticket, monto_ves))
            total_usd += monto_usd
            total_ves += monto_ves

        db.commit()
        for ticket, _ in tickets_creados:
            db.refresh(ticket)

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al registrar la venta: {str(e)}")

    tickets_respuesta = [
        TicketResponse(
            id=ticket.id,
            empresa_id=ticket.empresa_id,
            usuario_id=ticket.usuario_id,
            producto_id=ticket.producto_id,
            cliente_id=ticket.cliente_id,
            peso=ticket.peso,
            monto_usd=ticket.monto_usd,
            monto_ves=monto_ves,
            status=ticket.status,
            created_at=ticket.created_at,
            direccion_entrega=ticket.direccion_entrega,
            repartidor_id=ticket.repartidor_id,
            x=ticket.coord_x,
            y=ticket.coord_y,
            cliente=cliente.nombre if cliente else "Desconocido",
            direccion=ticket.direccion_entrega
        )
        for ticket, monto_ves in tickets_creados
    ]

    return VentaResponse(
        tickets=tickets_respuesta,
        total_usd=total_usd,
        total_ves=total_ves,
        tasa_bcv=tasa_bcv
    )

# 15. Listar Tickets/Ventas: filtrado obligatorio por empresa_id del token y opcionalmente
#     por 'status' y 'cliente_id'
@app.get("/api/v1/tickets", tags=["Ventas"], response_model=List[TicketResponse])
def listar_tickets(
    status: Optional[str] = None,
    cliente_id: Optional[int] = None,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))
):
    query = db.query(Ticket).filter(Ticket.empresa_id == usuario_actual.eid)
    if status:
        query = query.filter(Ticket.status == status)
    if cliente_id:
        query = query.filter(Ticket.cliente_id == cliente_id)

    tasa = db.query(TasaCambio).filter(TasaCambio.empresa_id == usuario_actual.eid).first()
    tasa_bcv = tasa.valor_bcv if tasa else Decimal("0")

    tickets = query.all()
    resultado = []
    for ticket in tickets:
        cliente_db = db.query(Cliente).filter(Cliente.id == ticket.cliente_id).first()
        cliente_nombre = cliente_db.nombre if cliente_db else "Desconocido"
        resultado.append(
            TicketResponse(
                id=ticket.id,
                empresa_id=ticket.empresa_id,
                usuario_id=ticket.usuario_id,
                producto_id=ticket.producto_id,
                cliente_id=ticket.cliente_id,
                peso=ticket.peso,
                monto_usd=ticket.monto_usd,
                monto_ves=(ticket.monto_usd * tasa_bcv).quantize(Decimal("0.01")),
                status=ticket.status,
                created_at=ticket.created_at,
                direccion_entrega=ticket.direccion_entrega,
                repartidor_id=ticket.repartidor_id,
                x=ticket.coord_x,
                y=ticket.coord_y,
                cliente=cliente_nombre,
                direccion=ticket.direccion_entrega
            )
        )
    return resultado

# 16. Dashboard de Reportes: KPIs operativos del día filtrados estrictamente por la
#     empresa del token (ventas de hoy, stock bajo, vencimientos próximos y mermas del mes)
@app.get("/api/v1/reportes/dashboard", tags=["Reportes"], response_model=DashboardResponse)
def obtener_dashboard(
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))
):
    empresa_id = usuario_actual.eid
    hoy = datetime.date.today()

    # Tasa BCV activa de la empresa (0 si aún no se ha configurado)
    tasa = db.query(TasaCambio).filter(TasaCambio.empresa_id == empresa_id).first()
    tasa_bcv = tasa.valor_bcv if tasa else Decimal("0")

    # --- Ventas del Día: suma de monto_usd de los tickets procesados hoy ---
    ventas_usd = db.query(
        func.coalesce(func.sum(Ticket.monto_usd), 0)
    ).filter(
        Ticket.empresa_id == empresa_id,
        Ticket.status == "procesado",
        func.date(Ticket.created_at) == hoy
    ).scalar()
    ventas_usd = Decimal(str(ventas_usd))
    ventas_ves = (ventas_usd * tasa_bcv).quantize(Decimal("0.01"))

    # --- Alertas de Stock Bajo: stock total (suma de lotes activos) <= 10 unidades ---
    stock_bajo_rows = (
        db.query(
            Producto.id,
            Producto.codigo_interno,
            Producto.nombre,
            func.coalesce(func.sum(Lote.cantidad_actual), 0).label("stock_total")
        )
        .outerjoin(
            Lote,
            and_(
                Lote.producto_id == Producto.id,
                Lote.empresa_id == empresa_id,
                Lote.status == "activo"
            )
        )
        .filter(Producto.empresa_id == empresa_id, Producto.status == True)
        .group_by(Producto.id, Producto.codigo_interno, Producto.nombre)
        .having(func.coalesce(func.sum(Lote.cantidad_actual), 0) <= 10)
        .all()
    )
    alertas_stock_bajo = [
        StockBajoItem(
            producto_id=row.id,
            codigo_interno=row.codigo_interno,
            nombre=row.nombre,
            stock_total=Decimal(str(row.stock_total))
        )
        for row in stock_bajo_rows
    ]

    # --- Alertas de Vencimiento Crítico: lotes activos que vencen en menos de 30 días ---
    limite_vencimiento = hoy + datetime.timedelta(days=30)
    lotes_criticos = (
        db.query(Lote, Producto.nombre)
        .join(Producto, Producto.id == Lote.producto_id)
        .filter(
            Lote.empresa_id == empresa_id,
            Lote.status == "activo",
            Lote.fecha_vencimiento <= limite_vencimiento
        )
        .order_by(Lote.fecha_vencimiento.asc())
        .all()
    )
    alertas_vencimiento = [
        LoteCriticoItem(
            lote_id=lote.id,
            producto_id=lote.producto_id,
            producto_nombre=producto_nombre,
            codigo_lote=lote.codigo_lote,
            cantidad_actual=lote.cantidad_actual,
            fecha_vencimiento=lote.fecha_vencimiento,
            dias_restantes=(lote.fecha_vencimiento - hoy).days
        )
        for lote, producto_nombre in lotes_criticos
    ]

    # --- Resumen de Mermas del Mes en curso: total mermado, registros y motivo más frecuente ---
    primer_dia_mes = datetime.datetime.combine(hoy.replace(day=1), datetime.time.min)
    total_mermado, total_registros = db.query(
        func.coalesce(func.sum(Merma.cantidad), 0),
        func.count(Merma.id)
    ).filter(
        Merma.empresa_id == empresa_id,
        Merma.created_at >= primer_dia_mes
    ).one()

    motivo_row = (
        db.query(Merma.motivo, func.count(Merma.id).label("total"))
        .filter(Merma.empresa_id == empresa_id, Merma.created_at >= primer_dia_mes)
        .group_by(Merma.motivo)
        .order_by(func.count(Merma.id).desc())
        .first()
    )
    motivo_mas_frecuente = motivo_row[0] if motivo_row else None

    return DashboardResponse(
        tasa_bcv=tasa_bcv,
        ventas_hoy=VentasHoyResponse(monto_usd=ventas_usd, monto_ves=ventas_ves),
        alertas_stock_bajo=alertas_stock_bajo,
        alertas_vencimiento=alertas_vencimiento,
        resumen_mermas_mes=ResumenMermasResponse(
            cantidad_total_mermada=Decimal(str(total_mermado)),
            total_registros=total_registros,
            motivo_mas_frecuente=motivo_mas_frecuente
        )
    )

# --- CRM: Post-Venta y Control de Faltantes ---

# Verifica si existe stock activo (> 0) de un producto cuyo nombre coincide con el item solicitado
def _item_disponible(db: Session, empresa_id: int, item: str) -> bool:
    stock = (
        db.query(func.coalesce(func.sum(Lote.cantidad_actual), 0))
        .join(Producto, Producto.id == Lote.producto_id)
        .filter(
            Producto.empresa_id == empresa_id,
            Lote.empresa_id == empresa_id,
            Lote.status == "activo",
            Producto.nombre.ilike(f"%{item}%")
        )
        .scalar()
    )
    return Decimal(str(stock)) > 0

# 17. Registrar Petición de Faltante: el cliente solicita un producto que no está en catálogo/stock
@app.post("/api/v1/crm/faltantes", tags=["CRM"], response_model=PeticionFaltanteResponse)
def crear_peticion_faltante(
    datos: PeticionFaltanteCreate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))
):
    empresa_id = usuario_actual.eid
    cliente = db.query(Cliente).filter(Cliente.id == datos.cliente_id, Cliente.empresa_id == empresa_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado.")

    peticion = PeticionFaltante(empresa_id=empresa_id, cliente_id=datos.cliente_id, item=datos.item)
    db.add(peticion)
    db.commit()
    db.refresh(peticion)

    return PeticionFaltanteResponse(
        id=peticion.id, cliente_id=peticion.cliente_id, cliente_nombre=cliente.nombre,
        item=peticion.item, status=peticion.status,
        disponible=_item_disponible(db, empresa_id, peticion.item),
        created_at=peticion.created_at
    )

# 18. Listar Peticiones de Faltantes: Libro de Faltantes con disponibilidad de stock calculada en vivo
@app.get("/api/v1/crm/faltantes", tags=["CRM"], response_model=List[PeticionFaltanteResponse])
def listar_peticiones_faltantes(
    skip: int = 0, limit: int = 100,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))
):
    empresa_id = usuario_actual.eid
    filas = (
        db.query(PeticionFaltante, Cliente.nombre)
        .join(Cliente, Cliente.id == PeticionFaltante.cliente_id)
        .filter(PeticionFaltante.empresa_id == empresa_id)
        .order_by(PeticionFaltante.created_at.desc())
        .offset(skip).limit(limit)
        .all()
    )
    return [
        PeticionFaltanteResponse(
            id=p.id, cliente_id=p.cliente_id, cliente_nombre=nombre,
            item=p.item, status=p.status,
            disponible=_item_disponible(db, empresa_id, p.item),
            created_at=p.created_at
        )
        for p, nombre in filas
    ]

# 19. Logs de Post-Venta: feed de actividad del bot de calidad y ofertas
@app.get("/api/v1/crm/postventa-logs", tags=["CRM"], response_model=List[SeguimientoBotResponse])
def listar_postventa_logs(
    cliente_id: Optional[int] = None,
    status_envio: Optional[str] = None,
    skip: int = 0, limit: int = 100,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))
):
    empresa_id = usuario_actual.eid
    query = (
        db.query(SeguimientoBot, Cliente.nombre)
        .join(Ticket, Ticket.id == SeguimientoBot.ticket_id)
        .join(Cliente, Cliente.id == Ticket.cliente_id)
        .filter(SeguimientoBot.empresa_id == empresa_id)
    )
    if cliente_id is not None:
        query = query.filter(Ticket.cliente_id == cliente_id)
    if status_envio is not None:
        query = query.filter(SeguimientoBot.status_envio == status_envio)

    filas = (
        query.order_by(SeguimientoBot.created_at.desc())
        .offset(skip).limit(limit)
        .all()
    )
    return [
        SeguimientoBotResponse(
            id=s.id, ticket_id=s.ticket_id, cliente_nombre=nombre,
            tipo_mensaje=s.tipo_mensaje, respuesta_cliente=s.respuesta_cliente,
            status_envio=s.status_envio, created_at=s.created_at
        )
        for s, nombre in filas
    ]

# 19b. Registrar Encuesta de Post-Venta
@app.post("/api/v1/crm/postventa-logs", tags=["CRM"], response_model=SeguimientoBotResponse, status_code=status.HTTP_201_CREATED)
def crear_postventa_log(
    datos: SeguimientoBotCreate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(get_current_user)
):
    ticket = db.query(Ticket).filter(Ticket.id == datos.ticket_id, Ticket.empresa_id == usuario_actual.eid).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado o no pertenece a su empresa.")
        
    cliente = db.query(Cliente).filter(Cliente.id == ticket.cliente_id).first()
    cliente_nombre = cliente.nombre if cliente else "Desconocido"

    nuevo_log = SeguimientoBot(
        empresa_id=usuario_actual.eid,
        ticket_id=datos.ticket_id,
        tipo_mensaje=datos.tipo_mensaje,
        respuesta_cliente=datos.respuesta_cliente,
        status_envio=datos.status_envio
    )
    try:
        db.add(nuevo_log)
        db.commit()
        db.refresh(nuevo_log)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al registrar la encuesta: {str(e)}")
        
    return SeguimientoBotResponse(
        id=nuevo_log.id,
        ticket_id=nuevo_log.ticket_id,
        cliente_nombre=cliente_nombre,
        tipo_mensaje=nuevo_log.tipo_mensaje,
        respuesta_cliente=nuevo_log.respuesta_cliente,
        status_envio=nuevo_log.status_envio,
        created_at=nuevo_log.created_at
    )

# 19c. Resolver Encuesta de Post-Venta
@app.put("/api/v1/crm/postventa-logs/{log_id}", tags=["CRM"], response_model=SeguimientoBotResponse)
def actualizar_postventa_log(
    log_id: int,
    datos: SeguimientoBotUpdate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))
):
    log = db.query(SeguimientoBot).filter(SeguimientoBot.id == log_id, SeguimientoBot.empresa_id == usuario_actual.eid).first()
    if not log:
        raise HTTPException(status_code=404, detail="Registro de postventa no encontrado.")
        
    ticket = db.query(Ticket).filter(Ticket.id == log.ticket_id).first()
    cliente = db.query(Cliente).filter(Cliente.id == ticket.cliente_id).first() if ticket else None
    cliente_nombre = cliente.nombre if cliente else "Desconocido"

    log.status_envio = datos.status_envio
    if datos.respuesta_cliente is not None:
        log.respuesta_cliente = datos.respuesta_cliente
        
    try:
        db.commit()
        db.refresh(log)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al actualizar la encuesta: {str(e)}")
        
    return SeguimientoBotResponse(
        id=log.id,
        ticket_id=log.ticket_id,
        cliente_nombre=cliente_nombre,
        tipo_mensaje=log.tipo_mensaje,
        respuesta_cliente=log.respuesta_cliente,
        status_envio=log.status_envio,
        created_at=log.created_at
    )


# 20. Crear Proveedor (Aislamiento Multi-Tenant)
@app.post("/api/v1/proveedores", tags=["Proveedores"], response_model=ProveedorResponse, status_code=status.HTTP_201_CREATED)
def crear_proveedor(
    datos: ProveedorCreate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))
):
    duplicado = db.query(Proveedor).filter(
        Proveedor.empresa_id == usuario_actual.eid,
        Proveedor.rif == datos.rif.strip()
    ).first()
    if duplicado:
        raise HTTPException(status_code=400, detail="Ya existe un proveedor con ese RIF en su empresa.")

    nuevo_proveedor = Proveedor(
        empresa_id=usuario_actual.eid,
        rif=datos.rif.strip(),
        nombre=datos.nombre.strip(),
        telefono=datos.telefono.strip() if datos.telefono else None,
        email=datos.email.strip() if datos.email else None,
        direccion=datos.direccion.strip() if datos.direccion else None
    )
    try:
        db.add(nuevo_proveedor)
        db.commit()
        db.refresh(nuevo_proveedor)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al registrar el proveedor: {str(e)}")
    return nuevo_proveedor

# 21. Listar Proveedores (Aislamiento Multi-Tenant)
@app.get("/api/v1/proveedores", tags=["Proveedores"], response_model=List[ProveedorResponse])
def listar_proveedores(
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))
):
    return db.query(Proveedor).filter(Proveedor.empresa_id == usuario_actual.eid).all()

# 22. Crear Vehículo (Aislamiento Multi-Tenant)
@app.post("/api/v1/vehiculos", tags=["Vehículos"], response_model=VehiculoResponse, status_code=status.HTTP_201_CREATED)
def crear_vehiculo(
    datos: VehiculoCreate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))
):
    duplicado = db.query(Vehiculo).filter(
        Vehiculo.empresa_id == usuario_actual.eid,
        Vehiculo.placa == datos.placa.strip()
    ).first()
    if duplicado:
        raise HTTPException(status_code=400, detail="Ya existe un vehículo con esa placa en su empresa.")

    nuevo_vehiculo = Vehiculo(
        empresa_id=usuario_actual.eid,
        placa=datos.placa.strip(),
        marca=datos.marca.strip(),
        modelo=datos.modelo.strip(),
        tipo=datos.tipo.strip(),
        status=datos.status.strip()
    )
    try:
        db.add(nuevo_vehiculo)
        db.commit()
        db.refresh(nuevo_vehiculo)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al registrar el vehículo: {str(e)}")
    return nuevo_vehiculo

# 23. Listar Vehículos (Aislamiento Multi-Tenant)
@app.get("/api/v1/vehiculos", tags=["Vehículos"], response_model=List[VehiculoResponse])
def listar_vehiculos(
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))
):
    return db.query(Vehiculo).filter(Vehiculo.empresa_id == usuario_actual.eid).all()

# 23b. Reportar Posición GPS en Vivo del Vehículo (lo invoca el celular del repartidor
#      cada pocos segundos mientras está en ruta, para el tracking en el mapa de despacho)
@app.put("/api/v1/vehiculos/{vehiculo_id}/ubicacion", tags=["Vehículos"], response_model=VehiculoResponse)
def actualizar_ubicacion_vehiculo(
    vehiculo_id: int,
    datos: VehiculoUbicacionUpdate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))
):
    vehiculo = db.query(Vehiculo).filter(
        Vehiculo.id == vehiculo_id,
        Vehiculo.empresa_id == usuario_actual.eid
    ).first()
    if not vehiculo:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado o no pertenece a su empresa.")

    vehiculo.lat = datos.lat
    vehiculo.lng = datos.lng
    vehiculo.ubicacion_actualizada_en = datetime.datetime.now(datetime.timezone.utc)

    try:
        db.commit()
        db.refresh(vehiculo)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al actualizar la ubicación del vehículo: {str(e)}")

    return vehiculo

# 24. Crear Usuario / Empleado (Aislamiento Multi-Tenant, solo Propietarios/Admin)
@app.post("/api/v1/usuarios", tags=["Usuarios"], response_model=UsuarioResponse, status_code=status.HTTP_201_CREATED)
def crear_usuario(
    datos: UsuarioCreate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))
):
    duplicado = db.query(Usuario).filter(Usuario.email == datos.email.strip()).first()
    if duplicado:
        raise HTTPException(status_code=400, detail="El correo electrónico ya está en uso.")

    nuevo_usuario = Usuario(
        empresa_id=usuario_actual.eid,
        nombre=datos.nombre.strip(),
        email=datos.email.strip(),
        password_hash=generar_hash_password(datos.password[:72]),
        rol=datos.rol.strip().lower(),
        status=datos.status
    )
    try:
        db.add(nuevo_usuario)
        db.commit()
        db.refresh(nuevo_usuario)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al registrar el usuario: {str(e)}")
    return nuevo_usuario

# 25. Listar Usuarios / Empleados (Aislamiento Multi-Tenant, solo Propietarios/Admin)
@app.get("/api/v1/usuarios", tags=["Usuarios"], response_model=List[UsuarioResponse])
def listar_usuarios(
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))
):
    return db.query(Usuario).filter(Usuario.empresa_id == usuario_actual.eid).all()

# 26. Analizar Foto de Producto con IA (Simulador Inteligente de Visión Computacional)
@app.post("/api/v1/productos/analizar-foto", tags=["Productos"])
async def analizar_foto_producto(
    file: UploadFile = File(...),
    usuario_actual: TokenData = Depends(get_current_user)
):
    nombre_archivo = file.filename.lower()
    
    # Simulación inteligente según palabras clave del archivo
    if "harina" in nombre_archivo or "pan" in nombre_archivo:
        return {
            "codigo_interno": "P001",
            "codigo_barras": "7591001000112",
            "nombre": "Harina de Maíz Blanco Precocida",
            "marca": "P.A.N.",
            "linea": "Víveres",
            "clase_o_tipo": "Harinas",
            "tipo_envase": "Empaque",
            "peso": 1.000,
            "ubicacion": "Pasillo 1 - Anaquel A",
            "tipo_venta": "unidad",
            "refrigerado": False,
            "perecedero": True,
            "fecha_elaboracion": str(datetime.date.today() - datetime.timedelta(days=15)),
            "fecha_vencimiento": str(datetime.date.today() + datetime.timedelta(days=180)),
            "costo_usd": 1.10,
            "precio_1_detalle": 1.35,
            "precio_2_mayorista": 1.25,
            "precio_3_especial": 1.20,
            "aplica_iva": False,
            "foto_url": "https://images.unsplash.com/photo-1590080875515-8a3a8dc5735e?auto=format&fit=crop&w=400&q=80"
        }
    elif "pepsi" in nombre_archivo or "refresco" in nombre_archivo or "cola" in nombre_archivo:
        return {
            "codigo_interno": "PEPSI-1.5L",
            "codigo_barras": "7591001001234",
            "nombre": "Refresco Pepsi Cola",
            "marca": "Pepsi",
            "linea": "Bebidas",
            "clase_o_tipo": "Refrescos",
            "tipo_envase": "Botella",
            "peso": 1.500,
            "ubicacion": "Nevera Bebidas 2",
            "tipo_venta": "unidad",
            "refrigerado": True,
            "perecedero": True,
            "fecha_elaboracion": str(datetime.date.today() - datetime.timedelta(days=30)),
            "fecha_vencimiento": str(datetime.date.today() + datetime.timedelta(days=360)),
            "costo_usd": 1.50,
            "precio_1_detalle": 1.95,
            "precio_2_mayorista": 1.80,
            "precio_3_especial": 1.70,
            "aplica_iva": True,
            "foto_url": "https://images.unsplash.com/photo-1629203851122-3726ecdf080e?auto=format&fit=crop&w=400&q=80"
        }
    elif "remedio" in nombre_archivo or "medicina" in nombre_archivo or "pastilla" in nombre_archivo or "jarabe" in nombre_archivo:
        return {
            "codigo_interno": "MED-IBU400",
            "codigo_barras": "7592002003456",
            "nombre": "Ibuprofeno 400mg",
            "marca": "Genfar",
            "linea": "Farmacia",
            "clase_o_tipo": "Analgésicos",
            "tipo_envase": "Blíster",
            "peso": 0.050,
            "ubicacion": "Vitrina Principal A",
            "tipo_venta": "unidad",
            "refrigerado": False,
            "perecedero": True,
            "fecha_elaboracion": str(datetime.date.today() - datetime.timedelta(days=90)),
            "fecha_vencimiento": str(datetime.date.today() + datetime.timedelta(days=720)),
            "costo_usd": 2.20,
            "precio_1_detalle": 3.50,
            "precio_2_mayorista": 3.00,
            "precio_3_especial": 2.80,
            "aplica_iva": False,
            "foto_url": "https://images.unsplash.com/photo-1584017911766-d451b3d0e843?auto=format&fit=crop&w=400&q=80"
        }
    else:
        return {
            "codigo_interno": f"GEN-{datetime.date.today().strftime('%m%d')}",
            "codigo_barras": "7593003004567",
            "nombre": "Galletas de Soda Crackers",
            "marca": "Mary",
            "linea": "Víveres",
            "clase_o_tipo": "Galletas",
            "tipo_envase": "Empaque",
            "peso": 0.350,
            "ubicacion": "Pasillo 3 - Anaquel B",
            "tipo_venta": "unidad",
            "refrigerado": False,
            "perecedero": True,
            "fecha_elaboracion": str(datetime.date.today() - datetime.timedelta(days=20)),
            "fecha_vencimiento": str(datetime.date.today() + datetime.timedelta(days=240)),
            "costo_usd": 0.85,
            "precio_1_detalle": 1.20,
            "precio_2_mayorista": 1.10,
            "precio_3_especial": 1.05,
            "aplica_iva": True,
            "foto_url": "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=400&q=80"
        }

# 27. Registrar Pesaje (Balanza Digital - Ticket Pendiente)
@app.post("/api/v1/tickets/pesaje", tags=["Ventas"], response_model=TicketResponse, status_code=status.HTTP_201_CREATED)
def crear_ticket_pesaje(
    datos: TicketPesajeCreate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(get_current_user)
):
    cliente = db.query(Cliente).filter(Cliente.id == datos.cliente_id, Cliente.empresa_id == usuario_actual.eid).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado.")

    producto = db.query(Producto).filter(Producto.id == datos.producto_id, Producto.empresa_id == usuario_actual.eid).first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado.")

    # Calcular monto USD
    monto_usd = (datos.peso * producto.precio_1_detalle).quantize(Decimal("0.01"))

    tasa = db.query(TasaCambio).filter(TasaCambio.empresa_id == usuario_actual.eid).first()
    tasa_bcv = tasa.valor_bcv if tasa else Decimal("0")
    monto_ves = (monto_usd * tasa_bcv).quantize(Decimal("0.01"))

    nuevo_ticket = Ticket(
        empresa_id=usuario_actual.eid,
        usuario_id=usuario_actual.usuario_id,
        producto_id=datos.producto_id,
        cliente_id=datos.cliente_id,
        peso=datos.peso,
        monto_usd=monto_usd,
        status="pendiente"
    )
    try:
        db.add(nuevo_ticket)
        db.commit()
        db.refresh(nuevo_ticket)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al registrar el pesaje: {str(e)}")

    return TicketResponse(
        id=nuevo_ticket.id,
        empresa_id=nuevo_ticket.empresa_id,
        usuario_id=nuevo_ticket.usuario_id,
        producto_id=nuevo_ticket.producto_id,
        cliente_id=nuevo_ticket.cliente_id,
        peso=nuevo_ticket.peso,
        monto_usd=nuevo_ticket.monto_usd,
        monto_ves=monto_ves,
        status=nuevo_ticket.status,
        created_at=nuevo_ticket.created_at,
        direccion_entrega=nuevo_ticket.direccion_entrega,
        repartidor_id=nuevo_ticket.repartidor_id,
        x=nuevo_ticket.coord_x,
        y=nuevo_ticket.coord_y,
        cliente=cliente.nombre if cliente else "Desconocido",
        direccion=nuevo_ticket.direccion_entrega
    )

# 27b. Corregir el peso de un pesaje pendiente (ej. el cliente devuelve parte del
#      producto o el operador de la balanza se equivocó al pesar)
@app.put("/api/v1/tickets/{ticket_id}/peso", tags=["Ventas"], response_model=TicketResponse)
def actualizar_peso_ticket(
    ticket_id: int,
    datos: TicketPesoUpdate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))
):
    if datos.peso <= 0:
        raise HTTPException(status_code=400, detail="El peso debe ser mayor a cero.")

    ticket = db.query(Ticket).filter(
        Ticket.id == ticket_id,
        Ticket.empresa_id == usuario_actual.eid,
        Ticket.status == "pendiente"
    ).first()
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket no encontrado o no está en estatus pendiente."
        )

    producto = db.query(Producto).filter(Producto.id == ticket.producto_id).first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto asociado al ticket no encontrado.")

    ticket.peso = datos.peso
    ticket.monto_usd = (datos.peso * producto.precio_1_detalle).quantize(Decimal("0.01"))

    try:
        db.commit()
        db.refresh(ticket)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al modificar el peso del pesaje: {str(e)}")

    cliente = db.query(Cliente).filter(Cliente.id == ticket.cliente_id).first()
    tasa = db.query(TasaCambio).filter(TasaCambio.empresa_id == usuario_actual.eid).first()
    tasa_bcv = tasa.valor_bcv if tasa else Decimal("0")

    return TicketResponse(
        id=ticket.id,
        empresa_id=ticket.empresa_id,
        usuario_id=ticket.usuario_id,
        producto_id=ticket.producto_id,
        cliente_id=ticket.cliente_id,
        peso=ticket.peso,
        monto_usd=ticket.monto_usd,
        monto_ves=(ticket.monto_usd * tasa_bcv).quantize(Decimal("0.01")),
        status=ticket.status,
        created_at=ticket.created_at,
        direccion_entrega=ticket.direccion_entrega,
        repartidor_id=ticket.repartidor_id,
        x=ticket.coord_x,
        y=ticket.coord_y,
        cliente=cliente.nombre if cliente else "Desconocido",
        direccion=ticket.direccion_entrega
    )

# 28. Procesar Pago y Liquidación de Tickets de Balanza (Caja / POS)
# 28. Cancelar Ticket de Balanza Pendiente (Caja / POS)
@app.put("/api/v1/tickets/{ticket_id}/cancelar", tags=["Ventas"])
def cancelar_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))
):
    ticket = db.query(Ticket).filter(
        Ticket.id == ticket_id,
        Ticket.empresa_id == usuario_actual.eid,
        Ticket.status == "pendiente"
    ).first()
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket no encontrado o no está en estatus pendiente."
        )
    ticket.status = "cancelado"
    db.commit()
    return {"mensaje": "Ticket cancelado exitosamente.", "ticket_id": ticket_id}

# 29. Procesar Pago y Liquidación de Tickets de Balanza (Caja / POS)
@app.post("/api/v1/tickets/procesar-pago", tags=["Ventas"])
def procesar_pago_tickets(
    datos: ProcesarPagoTickets,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))
):
    tickets_procesados = []
    try:
        mod_map = {}
        if datos.modificaciones:
            for mod in datos.modificaciones:
                mod_map[mod.ticket_id] = mod.peso

        for tid in datos.ticket_ids:
            ticket = db.query(Ticket).filter(
                Ticket.id == tid,
                Ticket.empresa_id == usuario_actual.eid,
                Ticket.status == "pendiente"
            ).first()
            if not ticket:
                continue

            # Aplicar modificación de peso si existe
            if ticket.id in mod_map:
                nuevo_peso = mod_map[ticket.id]
                producto = db.query(Producto).filter(Producto.id == ticket.producto_id).first()
                if producto:
                    ticket.peso = nuevo_peso
                    ticket.monto_usd = (nuevo_peso * producto.precio_1_detalle).quantize(Decimal("0.01"))

            # Descontar stock usando FIFO/FEFO
            lotes = db.query(Lote).filter(
                Lote.empresa_id == usuario_actual.eid,
                Lote.producto_id == ticket.producto_id,
                Lote.status == "activo",
                Lote.cantidad_actual > 0
            ).order_by(Lote.fecha_vencimiento.asc(), Lote.fecha_ingreso.asc()).all()

            stock_disponible = sum((lote.cantidad_actual for lote in lotes), Decimal("0"))
            if stock_disponible < ticket.peso:
                producto = db.query(Producto).filter(Producto.id == ticket.producto_id).first()
                nombre_p = producto.nombre if producto else f"ID {ticket.producto_id}"
                raise HTTPException(
                    status_code=400,
                    detail=f"Stock insuficiente en lotes para '{nombre_p}'. Disponible: {stock_disponible}, solicitado: {ticket.peso}"
                )

            restante = ticket.peso
            for lote in lotes:
                if restante <= 0:
                    break
                descuento = min(lote.cantidad_actual, restante)
                lote.cantidad_actual -= descuento
                restante -= descuento
                if lote.cantidad_actual == 0:
                    lote.status = "agotado"

            ticket.status = "procesado"
            tickets_procesados.append(ticket)

        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al procesar el cobro: {str(e)}")

    return {"mensaje": "Cobro de balanza finalizado.", "tickets_actualizados": len(tickets_procesados)}


# --- Utilidades y Endpoints de Delivery Exprés y Compras ---

def lat_lng_to_svg(lat: float, lng: float) -> tuple[float, float]:
    min_lat, max_lat = 8.5900, 8.6600
    min_lng, max_lng = -70.2400, -70.1800
    y = 340.0 - ((lat - min_lat) / (max_lat - min_lat)) * 320.0
    x = 20.0 + ((lng - min_lng) / (max_lng - min_lng)) * 460.0
    return round(x, 1), round(y, 1)

@app.post("/api/v1/pedidos", tags=["Delivery"], response_model=PedidoDeliveryResponse, status_code=status.HTTP_201_CREATED)
def crear_pedido_delivery(
    datos: PedidoDeliveryCreate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))
):
    x, y = lat_lng_to_svg(datos.destino_lat, datos.destino_lng)
    nuevo_pedido = PedidoDelivery(
        empresa_id=usuario_actual.eid,
        cliente_nombre=datos.cliente_nombre,
        cliente_telefono=datos.cliente_telefono,
        cliente_direccion=datos.cliente_direccion,
        vehiculo_id=datos.vehiculo_id,
        chofer_cedula=datos.chofer_cedula,
        origen=datos.origen,
        origen_lat=datos.origen_lat,
        origen_lng=datos.origen_lng,
        destino=datos.destino,
        destino_lat=datos.destino_lat,
        destino_lng=datos.destino_lng,
        distancia_km=datos.distancia_km,
        eta_min=datos.eta_min,
        estado=datos.estado,
        metodo_pago=datos.metodo_pago,
        monto_total=datos.monto_total,
        notas=datos.notas,
        coord_x=x,
        coord_y=y
    )
    try:
        db.add(nuevo_pedido)
        db.commit()
        db.refresh(nuevo_pedido)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al crear el pedido de delivery: {str(e)}")
    return nuevo_pedido

@app.get("/api/v1/pedidos", tags=["Delivery"], response_model=List[PedidoDeliveryResponse])
def listar_pedidos_delivery(
    estado: Optional[str] = None,
    chofer_cedula: Optional[str] = None,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))
):
    query = db.query(PedidoDelivery).filter(PedidoDelivery.empresa_id == usuario_actual.eid)
    if estado:
        query = query.filter(PedidoDelivery.estado == estado)
    if chofer_cedula:
        query = query.filter(PedidoDelivery.chofer_cedula == chofer_cedula)
    return query.order_by(PedidoDelivery.created_at.desc()).all()

# Estados válidos del workflow de un pedido de delivery (igual que en el formulario de despacho)
ESTADOS_PEDIDO_VALIDOS = {"CREADO", "ARMADO", "FACTURADO", "EN_VIA", "DESPACHADO", "PAGADO", "CREDITO"}

# 26b. Actualizar el Estado de un Pedido de Delivery (lo usa tanto el despachador en Caja
#      como el propio repartidor desde su app para avanzar el workflow: EN_VIA -> DESPACHADO -> PAGADO)
@app.put("/api/v1/pedidos/{pedido_id}/estado", tags=["Delivery"], response_model=PedidoDeliveryResponse)
def actualizar_estado_pedido(
    pedido_id: int,
    datos: PedidoDeliveryEstadoUpdate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))
):
    if datos.estado not in ESTADOS_PEDIDO_VALIDOS:
        raise HTTPException(status_code=400, detail=f"Estado inválido. Use uno de: {', '.join(sorted(ESTADOS_PEDIDO_VALIDOS))}.")

    pedido = db.query(PedidoDelivery).filter(
        PedidoDelivery.id == pedido_id,
        PedidoDelivery.empresa_id == usuario_actual.eid
    ).first()
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido de delivery no encontrado o no pertenece a su empresa.")

    pedido.estado = datos.estado

    try:
        db.commit()
        db.refresh(pedido)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al actualizar el estado del pedido: {str(e)}")

    return pedido

@app.post("/api/v1/pedidos/guardar-auditado", tags=["Compras"], response_model=OrdenCompraResponse, status_code=status.HTTP_201_CREATED)
def crear_orden_compra(
    datos: OrdenCompraCreate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))
):
    if not datos.items:
        raise HTTPException(status_code=400, detail="La orden de compra debe incluir al menos un producto.")
    total_usd = sum((item.cantidad * item.costo for item in datos.items), 0.0)
    nueva_orden = OrdenCompra(
        empresa_id=usuario_actual.eid,
        proveedor=datos.proveedor,
        items_count=len(datos.items),
        total_usd=total_usd,
        origen="Borrador Auditado",
        estatus="Pendiente"
    )
    try:
        db.add(nueva_orden)
        db.flush()
        for item in datos.items:
            db.add(OrdenCompraItem(
                orden_id=nueva_orden.id,
                producto_nombre=item.nombre,
                cantidad=item.cantidad,
                costo=item.costo
            ))
        db.commit()
        db.refresh(nueva_orden)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al registrar la orden de compra: {str(e)}")
    return nueva_orden

@app.get("/api/v1/pedidos/ordenes", tags=["Compras"], response_model=List[OrdenCompraResponse])
def listar_ordenes_compra(
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))
):
    return db.query(OrdenCompra).filter(OrdenCompra.empresa_id == usuario_actual.eid).order_by(OrdenCompra.created_at.desc()).all()


# --- Módulo de Bancos y Tesorería ---

def _tasa_bcv_empresa(db: Session, empresa_id: int) -> Decimal:
    tasa = db.query(TasaCambio).filter(TasaCambio.empresa_id == empresa_id).first()
    return tasa.valor_bcv if tasa else Decimal("0")

def _calcular_resumen_tesoreria(db: Session, empresa_id: int) -> ResumenTesoreriaResponse:
    tasa_bcv = _tasa_bcv_empresa(db, empresa_id)
    cuentas = db.query(CuentaTesoreria).filter(
        CuentaTesoreria.empresa_id == empresa_id, CuentaTesoreria.status == "activa"
    ).all()

    items = []
    total_usd = Decimal("0")
    for c in cuentas:
        if c.moneda == "VES" and tasa_bcv > 0:
            equivalente = (c.saldo_actual / tasa_bcv).quantize(Decimal("0.01"))
        elif c.moneda == "VES":
            equivalente = Decimal("0")
        else:
            equivalente = c.saldo_actual.quantize(Decimal("0.01"))
        total_usd += equivalente
        items.append(SaldoPorCuentaItem(
            cuenta_id=c.id, banco=c.banco, alias=c.alias, moneda=c.moneda,
            saldo_actual=c.saldo_actual, saldo_usd_equivalente=equivalente
        ))

    return ResumenTesoreriaResponse(saldo_total_usd_equivalente=total_usd, tasa_bcv=tasa_bcv, cuentas=items)

@app.post("/api/v1/tesoreria/cuentas", tags=["Tesorería"], response_model=CuentaTesoreriaResponse, status_code=status.HTTP_201_CREATED)
def crear_cuenta_tesoreria(
    datos: CuentaTesoreriaCreate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))
):
    if datos.banco not in BANCOS_VALIDOS:
        raise HTTPException(status_code=400, detail=f"Banco/medio de pago inválido. Use uno de: {', '.join(BANCOS_VALIDOS)}.")

    nueva_cuenta = CuentaTesoreria(
        empresa_id=usuario_actual.eid,
        banco=datos.banco,
        alias=datos.alias.strip(),
        moneda=datos.moneda.strip().upper(),
        numero_referencia=datos.numero_referencia.strip() if datos.numero_referencia else None,
        saldo_actual=datos.saldo_actual
    )
    try:
        db.add(nueva_cuenta)
        db.commit()
        db.refresh(nueva_cuenta)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al registrar la cuenta: {str(e)}")
    return nueva_cuenta

@app.get("/api/v1/tesoreria/cuentas", tags=["Tesorería"], response_model=List[CuentaTesoreriaResponse])
def listar_cuentas_tesoreria(
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))
):
    return db.query(CuentaTesoreria).filter(
        CuentaTesoreria.empresa_id == usuario_actual.eid
    ).order_by(CuentaTesoreria.created_at.desc()).all()

@app.post("/api/v1/tesoreria/movimientos", tags=["Tesorería"], response_model=MovimientoTesoreriaResponse, status_code=status.HTTP_201_CREATED)
def crear_movimiento_tesoreria(
    datos: MovimientoTesoreriaCreate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))
):
    if datos.tipo not in ("ingreso", "egreso"):
        raise HTTPException(status_code=400, detail="El tipo de movimiento debe ser 'ingreso' o 'egreso'.")
    if datos.monto <= 0:
        raise HTTPException(status_code=400, detail="El monto debe ser mayor a cero.")

    cuenta = db.query(CuentaTesoreria).filter(
        CuentaTesoreria.id == datos.cuenta_id,
        CuentaTesoreria.empresa_id == usuario_actual.eid
    ).first()
    if not cuenta:
        raise HTTPException(status_code=404, detail="La cuenta indicada no existe o no pertenece a su empresa.")

    if datos.tipo == "egreso" and datos.monto > cuenta.saldo_actual:
        raise HTTPException(status_code=400, detail=f"Saldo insuficiente en '{cuenta.alias}'. Disponible: {cuenta.saldo_actual}.")

    nuevo_movimiento = MovimientoTesoreria(
        empresa_id=usuario_actual.eid,
        cuenta_id=cuenta.id,
        usuario_id=usuario_actual.usuario_id,
        tipo=datos.tipo,
        monto=datos.monto,
        concepto=datos.concepto.strip()
    )

    if datos.tipo == "ingreso":
        cuenta.saldo_actual += datos.monto
    else:
        cuenta.saldo_actual -= datos.monto

    try:
        db.add(nuevo_movimiento)
        db.commit()
        db.refresh(nuevo_movimiento)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al registrar el movimiento: {str(e)}")
    return nuevo_movimiento

@app.get("/api/v1/tesoreria/movimientos", tags=["Tesorería"], response_model=List[MovimientoTesoreriaResponse])
def listar_movimientos_tesoreria(
    cuenta_id: Optional[int] = None,
    skip: int = 0, limit: int = 100,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))
):
    query = db.query(MovimientoTesoreria).filter(MovimientoTesoreria.empresa_id == usuario_actual.eid)
    if cuenta_id:
        query = query.filter(MovimientoTesoreria.cuenta_id == cuenta_id)
    return query.order_by(MovimientoTesoreria.created_at.desc()).offset(skip).limit(limit).all()

@app.get("/api/v1/tesoreria/resumen", tags=["Tesorería"], response_model=ResumenTesoreriaResponse)
def resumen_tesoreria(
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))
):
    return _calcular_resumen_tesoreria(db, usuario_actual.eid)


# --- Módulo de Cartera y Créditos (CxC / CxP) ---

def _status_cuenta(monto_total: Decimal, monto_abonado: Decimal) -> str:
    if monto_abonado >= monto_total:
        return "pagada"
    if monto_abonado > 0:
        return "parcial"
    return "pendiente"

def _calcular_resumen_cartera(db: Session, empresa_id: int) -> ResumenCarteraResponse:
    hoy = datetime.date.today()

    cxc_abiertas = db.query(CuentaPorCobrar).filter(
        CuentaPorCobrar.empresa_id == empresa_id, CuentaPorCobrar.status != "pagada"
    ).all()
    total_cxc = sum((c.monto_total - c.monto_abonado for c in cxc_abiertas), Decimal("0"))
    cxc_vencidas = [c for c in cxc_abiertas if c.fecha_vencimiento < hoy]
    total_cxc_vencido = sum((c.monto_total - c.monto_abonado for c in cxc_vencidas), Decimal("0"))

    cxp_abiertas = db.query(CuentaPorPagar).filter(
        CuentaPorPagar.empresa_id == empresa_id, CuentaPorPagar.status != "pagada"
    ).all()
    total_cxp = sum((c.monto_total - c.monto_abonado for c in cxp_abiertas), Decimal("0"))
    cxp_vencidas = [c for c in cxp_abiertas if c.fecha_vencimiento < hoy]
    total_cxp_vencido = sum((c.monto_total - c.monto_abonado for c in cxp_vencidas), Decimal("0"))

    return ResumenCarteraResponse(
        total_por_cobrar=total_cxc, total_por_cobrar_vencido=total_cxc_vencido, cuentas_por_cobrar_vencidas=len(cxc_vencidas),
        total_por_pagar=total_cxp, total_por_pagar_vencido=total_cxp_vencido, cuentas_por_pagar_vencidas=len(cxp_vencidas)
    )

@app.post("/api/v1/cartera/cxc", tags=["Cartera"], response_model=CuentaPorCobrarResponse, status_code=status.HTTP_201_CREATED)
def crear_cxc(
    datos: CuentaPorCobrarCreate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))
):
    cliente = db.query(Cliente).filter(Cliente.id == datos.cliente_id, Cliente.empresa_id == usuario_actual.eid).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado.")
    if datos.monto_total <= 0:
        raise HTTPException(status_code=400, detail="El monto debe ser mayor a cero.")

    nueva = CuentaPorCobrar(
        empresa_id=usuario_actual.eid,
        cliente_id=cliente.id,
        monto_total=datos.monto_total,
        monto_abonado=Decimal("0"),
        fecha_emision=datos.fecha_emision or datetime.date.today(),
        fecha_vencimiento=datos.fecha_vencimiento,
        status="pendiente",
        notas=datos.notas
    )
    try:
        db.add(nueva)
        db.commit()
        db.refresh(nueva)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al registrar la cuenta por cobrar: {str(e)}")

    return CuentaPorCobrarResponse(
        id=nueva.id, empresa_id=nueva.empresa_id, cliente_id=nueva.cliente_id, cliente_nombre=cliente.nombre,
        monto_total=nueva.monto_total, monto_abonado=nueva.monto_abonado, saldo=nueva.monto_total - nueva.monto_abonado,
        fecha_emision=nueva.fecha_emision, fecha_vencimiento=nueva.fecha_vencimiento, status=nueva.status,
        notas=nueva.notas, created_at=nueva.created_at
    )

@app.get("/api/v1/cartera/cxc", tags=["Cartera"], response_model=List[CuentaPorCobrarResponse])
def listar_cxc(
    status_filtro: Optional[str] = None,
    cliente_id: Optional[int] = None,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_LECTURA_CARTERA))
):
    query = (
        db.query(CuentaPorCobrar, Cliente.nombre)
        .join(Cliente, Cliente.id == CuentaPorCobrar.cliente_id)
        .filter(CuentaPorCobrar.empresa_id == usuario_actual.eid)
    )
    if status_filtro:
        query = query.filter(CuentaPorCobrar.status == status_filtro)
    if cliente_id:
        query = query.filter(CuentaPorCobrar.cliente_id == cliente_id)

    filas = query.order_by(CuentaPorCobrar.fecha_vencimiento.asc()).all()
    return [
        CuentaPorCobrarResponse(
            id=c.id, empresa_id=c.empresa_id, cliente_id=c.cliente_id, cliente_nombre=nombre,
            monto_total=c.monto_total, monto_abonado=c.monto_abonado, saldo=c.monto_total - c.monto_abonado,
            fecha_emision=c.fecha_emision, fecha_vencimiento=c.fecha_vencimiento, status=c.status,
            notas=c.notas, created_at=c.created_at
        )
        for c, nombre in filas
    ]

@app.post("/api/v1/cartera/cxc/{cxc_id}/abono", tags=["Cartera"], response_model=CuentaPorCobrarResponse)
def abonar_cxc(
    cxc_id: int,
    datos: AbonoCreate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))
):
    cxc = db.query(CuentaPorCobrar).filter(CuentaPorCobrar.id == cxc_id, CuentaPorCobrar.empresa_id == usuario_actual.eid).first()
    if not cxc:
        raise HTTPException(status_code=404, detail="Cuenta por cobrar no encontrada.")
    if datos.monto <= 0:
        raise HTTPException(status_code=400, detail="El abono debe ser mayor a cero.")

    saldo_actual = cxc.monto_total - cxc.monto_abonado
    if datos.monto > saldo_actual:
        raise HTTPException(status_code=400, detail=f"El abono excede el saldo pendiente ({saldo_actual}).")

    cxc.monto_abonado += datos.monto
    cxc.status = _status_cuenta(cxc.monto_total, cxc.monto_abonado)

    try:
        db.commit()
        db.refresh(cxc)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al registrar el abono: {str(e)}")

    cliente = db.query(Cliente).filter(Cliente.id == cxc.cliente_id).first()
    return CuentaPorCobrarResponse(
        id=cxc.id, empresa_id=cxc.empresa_id, cliente_id=cxc.cliente_id, cliente_nombre=cliente.nombre if cliente else None,
        monto_total=cxc.monto_total, monto_abonado=cxc.monto_abonado, saldo=cxc.monto_total - cxc.monto_abonado,
        fecha_emision=cxc.fecha_emision, fecha_vencimiento=cxc.fecha_vencimiento, status=cxc.status,
        notas=cxc.notas, created_at=cxc.created_at
    )

@app.post("/api/v1/cartera/cxp", tags=["Cartera"], response_model=CuentaPorPagarResponse, status_code=status.HTTP_201_CREATED)
def crear_cxp(
    datos: CuentaPorPagarCreate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))
):
    proveedor = db.query(Proveedor).filter(Proveedor.id == datos.proveedor_id, Proveedor.empresa_id == usuario_actual.eid).first()
    if not proveedor:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado.")
    if datos.monto_total <= 0:
        raise HTTPException(status_code=400, detail="El monto debe ser mayor a cero.")

    nueva = CuentaPorPagar(
        empresa_id=usuario_actual.eid,
        proveedor_id=proveedor.id,
        monto_total=datos.monto_total,
        monto_abonado=Decimal("0"),
        fecha_emision=datos.fecha_emision or datetime.date.today(),
        fecha_vencimiento=datos.fecha_vencimiento,
        status="pendiente",
        notas=datos.notas
    )
    try:
        db.add(nueva)
        db.commit()
        db.refresh(nueva)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al registrar la cuenta por pagar: {str(e)}")

    return CuentaPorPagarResponse(
        id=nueva.id, empresa_id=nueva.empresa_id, proveedor_id=nueva.proveedor_id, proveedor_nombre=proveedor.nombre,
        monto_total=nueva.monto_total, monto_abonado=nueva.monto_abonado, saldo=nueva.monto_total - nueva.monto_abonado,
        fecha_emision=nueva.fecha_emision, fecha_vencimiento=nueva.fecha_vencimiento, status=nueva.status,
        notas=nueva.notas, created_at=nueva.created_at
    )

@app.get("/api/v1/cartera/cxp", tags=["Cartera"], response_model=List[CuentaPorPagarResponse])
def listar_cxp(
    status_filtro: Optional[str] = None,
    proveedor_id: Optional[int] = None,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))
):
    query = (
        db.query(CuentaPorPagar, Proveedor.nombre)
        .join(Proveedor, Proveedor.id == CuentaPorPagar.proveedor_id)
        .filter(CuentaPorPagar.empresa_id == usuario_actual.eid)
    )
    if status_filtro:
        query = query.filter(CuentaPorPagar.status == status_filtro)
    if proveedor_id:
        query = query.filter(CuentaPorPagar.proveedor_id == proveedor_id)

    filas = query.order_by(CuentaPorPagar.fecha_vencimiento.asc()).all()
    return [
        CuentaPorPagarResponse(
            id=c.id, empresa_id=c.empresa_id, proveedor_id=c.proveedor_id, proveedor_nombre=nombre,
            monto_total=c.monto_total, monto_abonado=c.monto_abonado, saldo=c.monto_total - c.monto_abonado,
            fecha_emision=c.fecha_emision, fecha_vencimiento=c.fecha_vencimiento, status=c.status,
            notas=c.notas, created_at=c.created_at
        )
        for c, nombre in filas
    ]

@app.post("/api/v1/cartera/cxp/{cxp_id}/abono", tags=["Cartera"], response_model=CuentaPorPagarResponse)
def abonar_cxp(
    cxp_id: int,
    datos: AbonoCreate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))
):
    cxp = db.query(CuentaPorPagar).filter(CuentaPorPagar.id == cxp_id, CuentaPorPagar.empresa_id == usuario_actual.eid).first()
    if not cxp:
        raise HTTPException(status_code=404, detail="Cuenta por pagar no encontrada.")
    if datos.monto <= 0:
        raise HTTPException(status_code=400, detail="El abono debe ser mayor a cero.")

    saldo_actual = cxp.monto_total - cxp.monto_abonado
    if datos.monto > saldo_actual:
        raise HTTPException(status_code=400, detail=f"El abono excede el saldo pendiente ({saldo_actual}).")

    cxp.monto_abonado += datos.monto
    cxp.status = _status_cuenta(cxp.monto_total, cxp.monto_abonado)

    try:
        db.commit()
        db.refresh(cxp)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al registrar el abono: {str(e)}")

    proveedor = db.query(Proveedor).filter(Proveedor.id == cxp.proveedor_id).first()
    return CuentaPorPagarResponse(
        id=cxp.id, empresa_id=cxp.empresa_id, proveedor_id=cxp.proveedor_id, proveedor_nombre=proveedor.nombre if proveedor else None,
        monto_total=cxp.monto_total, monto_abonado=cxp.monto_abonado, saldo=cxp.monto_total - cxp.monto_abonado,
        fecha_emision=cxp.fecha_emision, fecha_vencimiento=cxp.fecha_vencimiento, status=cxp.status,
        notas=cxp.notas, created_at=cxp.created_at
    )

@app.get("/api/v1/cartera/resumen", tags=["Cartera"], response_model=ResumenCarteraResponse)
def resumen_cartera(
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))
):
    return _calcular_resumen_cartera(db, usuario_actual.eid)


# --- Módulo de Estadísticas Avanzadas ---

def _calcular_estadisticas(db: Session, empresa_id: int) -> EstadisticasResumenResponse:
    hoy = datetime.date.today()
    hace_30_dias = hoy - datetime.timedelta(days=30)

    filas_ventas = (
        db.query(func.date(Ticket.created_at).label("fecha"), func.sum(Ticket.monto_usd).label("monto"))
        .filter(Ticket.empresa_id == empresa_id, Ticket.status == "procesado", func.date(Ticket.created_at) >= hace_30_dias)
        .group_by(func.date(Ticket.created_at))
        .order_by(func.date(Ticket.created_at))
        .all()
    )
    ventas_30d = [
        VentaDiariaItem(fecha=datetime.date.fromisoformat(str(f.fecha)), monto_usd=Decimal(str(f.monto)))
        for f in filas_ventas
    ]

    filas_top = (
        db.query(Producto.id, Producto.nombre, func.sum(Ticket.peso).label("cantidad"), func.sum(Ticket.monto_usd).label("monto"))
        .join(Ticket, Ticket.producto_id == Producto.id)
        .filter(Ticket.empresa_id == empresa_id, Ticket.status == "procesado", func.date(Ticket.created_at) >= hace_30_dias)
        .group_by(Producto.id, Producto.nombre)
        .order_by(func.sum(Ticket.monto_usd).desc())
        .limit(10)
        .all()
    )
    top_productos = [
        ProductoTopItem(producto_id=f.id, nombre=f.nombre, cantidad_vendida=Decimal(str(f.cantidad)), monto_usd=Decimal(str(f.monto)))
        for f in filas_top
    ]

    filas_dept = (
        db.query(Producto.linea, func.sum(Ticket.monto_usd).label("monto"))
        .join(Ticket, Ticket.producto_id == Producto.id)
        .filter(Ticket.empresa_id == empresa_id, Ticket.status == "procesado", func.date(Ticket.created_at) >= hace_30_dias)
        .group_by(Producto.linea)
        .order_by(func.sum(Ticket.monto_usd).desc())
        .all()
    )
    ventas_dept = [
        VentaPorDepartamentoItem(departamento=f.linea or "General", monto_usd=Decimal(str(f.monto)))
        for f in filas_dept
    ]

    primer_dia_mes_actual = hoy.replace(day=1)
    if primer_dia_mes_actual.month == 1:
        primer_dia_mes_anterior = primer_dia_mes_actual.replace(year=primer_dia_mes_actual.year - 1, month=12)
    else:
        primer_dia_mes_anterior = primer_dia_mes_actual.replace(month=primer_dia_mes_actual.month - 1)

    ventas_mes_actual = Decimal(str(db.query(func.coalesce(func.sum(Ticket.monto_usd), 0)).filter(
        Ticket.empresa_id == empresa_id, Ticket.status == "procesado", func.date(Ticket.created_at) >= primer_dia_mes_actual
    ).scalar()))
    ventas_mes_anterior = Decimal(str(db.query(func.coalesce(func.sum(Ticket.monto_usd), 0)).filter(
        Ticket.empresa_id == empresa_id, Ticket.status == "procesado",
        func.date(Ticket.created_at) >= primer_dia_mes_anterior, func.date(Ticket.created_at) < primer_dia_mes_actual
    ).scalar()))

    variacion_pct = None
    if ventas_mes_anterior > 0:
        variacion_pct = float(((ventas_mes_actual - ventas_mes_anterior) / ventas_mes_anterior) * 100)

    primer_dia_mes_dt = datetime.datetime.combine(primer_dia_mes_actual, datetime.time.min)
    mermas_mes = (
        db.query(Merma, Producto.precio_1_detalle)
        .join(Producto, Producto.id == Merma.producto_id)
        .filter(Merma.empresa_id == empresa_id, Merma.created_at >= primer_dia_mes_dt)
        .all()
    )
    mermas_usd = sum((Decimal(str(m.cantidad)) * precio for m, precio in mermas_mes), Decimal("0"))

    stock_critico_rows = (
        db.query(Producto.id)
        .outerjoin(Lote, and_(Lote.producto_id == Producto.id, Lote.empresa_id == empresa_id, Lote.status == "activo"))
        .filter(Producto.empresa_id == empresa_id, Producto.status == True)
        .group_by(Producto.id)
        .having(func.coalesce(func.sum(Lote.cantidad_actual), 0) <= 10)
        .all()
    )

    return EstadisticasResumenResponse(
        ventas_ultimos_30_dias=ventas_30d,
        top_productos=top_productos,
        ventas_por_departamento=ventas_dept,
        ventas_mes_actual_usd=ventas_mes_actual,
        ventas_mes_anterior_usd=ventas_mes_anterior,
        variacion_pct=variacion_pct,
        mermas_mes_usd_equivalente=mermas_usd.quantize(Decimal("0.01")),
        productos_stock_critico=len(stock_critico_rows)
    )

@app.get("/api/v1/estadisticas/resumen", tags=["Estadísticas"], response_model=EstadisticasResumenResponse)
def resumen_estadisticas(
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))
):
    return _calcular_estadisticas(db, usuario_actual.eid)


# --- Agentes de IA: VALE (Analítica), YHORGE (Cobranza y Tesorería), ALO (Ventas y CRM) ---
# Cada agente usa la API de Anthropic si hay ANTHROPIC_API_KEY configurada (ver app/core/ai_agent.py);
# si no, cae a un resumen basado en reglas sobre los mismos datos reales, así nunca dependen de un
# servicio externo para ser útiles desde el primer momento.

VALE_SYSTEM_PROMPT = (
    "Eres VALE, la analista de datos senior del SaaS MiniMarket. Tu trabajo es leer las cifras reales "
    "del negocio que se te entregan en el contexto (ventas, productos, mermas, stock) y producir un "
    "análisis breve, directo y en español venezolano, con 3 a 5 hallazgos concretos y al menos 2 "
    "recomendaciones de acción accionables (qué producto reabastecer, qué precio ajustar, qué día de "
    "la semana reforzar personal, etc.). Nunca inventes cifras que no estén en el contexto. Si los datos "
    "son insuficientes, dilo explícitamente. Sé conciso: máximo 200 palabras."
)

YHORGE_SYSTEM_PROMPT = (
    "Eres YHORGE, el especialista en cobranza y tesorería del SaaS MiniMarket. Recibes en el contexto "
    "las cuentas por cobrar (clientes que deben), cuentas por pagar (proveedores), los saldos de las "
    "cuentas bancarias y el detalle de las cuentas vencidas más urgentes con su cliente y teléfono. Tu "
    "trabajo es priorizar a quién cobrar primero (por monto y días de vencimiento), alertar si el flujo "
    "de caja está ajustado para cubrir las cuentas por pagar próximas, y sugerir un mensaje corto, cordial "
    "pero firme para enviar por WhatsApp al cliente con la deuda más urgente. Responde en español "
    "venezolano, tono profesional pero cercano, máximo 200 palabras."
)

ALO_SYSTEM_PROMPT = (
    "Eres ALO, el asistente de ventas y gestión de clientes del SaaS MiniMarket. Tienes visión 360° de "
    "cada cliente: su historial de compras, su saldo pendiente en cartera (CxC), sus visitas de campo y "
    "encuestas de mercadeo (si el negocio tiene vendedores de ruta), y sus presupuestos/pedidos recientes. "
    "Puedes hacer dos cosas según lo que se te pida:\n"
    "1. Si te piden redactar un mensaje (faltante, reactivación, recordatorio de pago, seguimiento de "
    "visita, oferta), redacta un mensaje corto, cálido y persuasivo en español venezolano, listo para "
    "enviar por WhatsApp, que salude al cliente por su nombre y use datos reales del contexto. Máximo 80 "
    "palabras, sin emojis excesivos (máximo 2). Devuelve solo el mensaje, sin explicaciones.\n"
    "2. Si te hacen una pregunta libre sobre el cliente (ej. '¿debe algo?', '¿cuándo fue su última "
    "visita?', '¿qué le sugiero vender?'), respóndela de forma directa y breve (máximo 100 palabras) "
    "usando solo los datos del contexto. Nunca inventes cifras, fechas o productos que no estén ahí; si "
    "falta información para responder, dilo explícitamente."
)

def _fallback_vale(contexto: dict) -> str:
    ventas_mes = contexto.get("ventas_mes_actual_usd", 0)
    ventas_mes_ant = contexto.get("ventas_mes_anterior_usd", 0)
    variacion = contexto.get("variacion_pct")
    top = contexto.get("top_productos") or []
    stock_critico = contexto.get("productos_stock_critico", 0)
    mermas = contexto.get("mermas_mes_usd_equivalente", 0)

    lineas = [f"📊 Ventas del mes: ${ventas_mes} (mes anterior: ${ventas_mes_ant})."]
    if variacion is not None:
        tendencia = "subieron" if variacion >= 0 else "bajaron"
        lineas.append(f"Las ventas {tendencia} un {abs(variacion):.1f}% respecto al mes pasado.")
    if top:
        lineas.append(f"Tu producto más vendido en los últimos 30 días es '{top[0].get('nombre')}'.")
    if stock_critico:
        lineas.append(f"⚠️ Tienes {stock_critico} producto(s) con stock crítico (≤10 unidades). Revisa reposición pronto.")
    if float(mermas) > 0:
        lineas.append(f"Las mermas de este mes equivalen a ${mermas}.")
    lineas.append("💡 Configura ANTHROPIC_API_KEY en el backend para que VALE te dé un análisis más profundo con IA.")
    return " ".join(lineas)

def _fallback_yhorge(contexto: dict) -> str:
    total_cxc = contexto.get("total_por_cobrar", 0)
    total_cxc_venc = contexto.get("total_por_cobrar_vencido", 0)
    cxc_venc_count = contexto.get("cuentas_por_cobrar_vencidas", 0)
    total_cxp = contexto.get("total_por_pagar", 0)
    saldo_tesoreria = contexto.get("saldo_total_usd_equivalente", 0)
    vencidas_detalle = contexto.get("cxc_vencidas_detalle") or []

    lineas = [f"💰 Tienes ${total_cxc} por cobrar en total, de los cuales ${total_cxc_venc} están vencidos ({cxc_venc_count} cuenta(s))."]
    lineas.append(f"Debes ${total_cxp} a proveedores. Tu saldo consolidado en tesorería es de ${saldo_tesoreria}.")
    if float(saldo_tesoreria) < float(total_cxp):
        lineas.append("⚠️ Tu saldo actual no cubre tus cuentas por pagar pendientes.")
    if vencidas_detalle:
        primero = vencidas_detalle[0]
        lineas.append(f"Prioriza cobrarle a {primero.get('cliente_nombre')}: debe ${primero.get('saldo')}, vencido hace {primero.get('dias_vencido')} día(s).")
    lineas.append("💡 Configura ANTHROPIC_API_KEY en el backend para que YHORGE te redacte mensajes de cobranza personalizados.")
    return " ".join(lineas)

def _fallback_alo(contexto: dict) -> str:
    nombre = contexto.get("cliente_nombre") or "cliente"
    compras = contexto.get("historial_compras") or []
    item_faltante = contexto.get("item_faltante")
    saldo_cxc = contexto.get("saldo_cxc_actual")
    visitas = contexto.get("visitas_recientes") or []
    pregunta = (contexto.get("pregunta_usuario") or "").strip()

    # Si hizo una pregunta libre, prioriza responderla con lo que sabemos, en vez del guión de mensaje
    if pregunta:
        lineas = [f"Sobre {nombre}:"]
        if saldo_cxc is not None and float(saldo_cxc) > 0:
            lineas.append(f"debe ${saldo_cxc} en cartera.")
        elif saldo_cxc is not None:
            lineas.append("no tiene saldo pendiente en cartera.")
        if compras:
            lineas.append(f"Su última compra fue '{compras[0].get('nombre')}' (${compras[0].get('monto_usd')}).")
        if visitas:
            lineas.append(f"Última visita registrada: {visitas[0].get('fecha_visita', '')[:10]}.")
        if len(lineas) == 1:
            lineas.append("No hay suficiente información registrada para responder con detalle.")
        lineas.append("💡 Configura ANTHROPIC_API_KEY para que ALO responda preguntas libres con más matiz.")
        return " ".join(lineas)

    if item_faltante:
        return f"Hola {nombre} 👋 vimos que buscabas '{item_faltante}'. Te avisamos en cuanto lo tengamos disponible. ¡Gracias por tu paciencia!"
    if saldo_cxc is not None and float(saldo_cxc) > 0:
        return f"Hola {nombre} 👋 te recordamos que tienes un saldo pendiente de ${saldo_cxc} con nosotros. ¿Coordinamos el pago esta semana?"
    if compras:
        ultimo = compras[0].get("nombre", "tu producto favorito")
        return f"Hola {nombre} 👋 ¡qué alegría saludarte! Notamos que sueles comprar {ultimo}. Tenemos buen stock fresco esta semana, ¿te separamos uno?"
    return f"Hola {nombre} 👋 ¡bienvenido/a! Cuéntanos qué buscas y te ayudamos a encontrarlo."

@app.post("/api/v1/agentes/vale", tags=["Agentes IA"], response_model=AgenteRespuesta)
def agente_vale(
    datos: AgenteConsulta,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))
):
    estadisticas = _calcular_estadisticas(db, usuario_actual.eid)
    contexto = estadisticas.model_dump(mode="json")

    resultado = consultar_agente(VALE_SYSTEM_PROMPT, contexto, datos.pregunta)
    if resultado["fuente"] == "ia" and resultado["respuesta"]:
        return AgenteRespuesta(agente="VALE", respuesta=resultado["respuesta"], fuente="ia")
    return AgenteRespuesta(agente="VALE", respuesta=_fallback_vale(contexto), fuente="reglas")

@app.post("/api/v1/agentes/yhorge", tags=["Agentes IA"], response_model=AgenteRespuesta)
def agente_yhorge(
    datos: AgenteConsulta,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))
):
    empresa_id = usuario_actual.eid
    hoy = datetime.date.today()

    resumen_cart = _calcular_resumen_cartera(db, empresa_id)
    resumen_tes = _calcular_resumen_tesoreria(db, empresa_id)

    filas_vencidas = (
        db.query(CuentaPorCobrar, Cliente.nombre, Cliente.telefono)
        .join(Cliente, Cliente.id == CuentaPorCobrar.cliente_id)
        .filter(
            CuentaPorCobrar.empresa_id == empresa_id,
            CuentaPorCobrar.status != "pagada",
            CuentaPorCobrar.fecha_vencimiento < hoy
        )
        .order_by((CuentaPorCobrar.monto_total - CuentaPorCobrar.monto_abonado).desc())
        .limit(5)
        .all()
    )
    vencidas_detalle = [
        {
            "cliente_nombre": nombre,
            "telefono": telefono,
            "saldo": float(c.monto_total - c.monto_abonado),
            "dias_vencido": (hoy - c.fecha_vencimiento).days
        }
        for c, nombre, telefono in filas_vencidas
    ]

    contexto = {
        **resumen_cart.model_dump(mode="json"),
        **resumen_tes.model_dump(mode="json"),
        "cxc_vencidas_detalle": vencidas_detalle,
    }

    resultado = consultar_agente(YHORGE_SYSTEM_PROMPT, contexto, datos.pregunta)
    if resultado["fuente"] == "ia" and resultado["respuesta"]:
        return AgenteRespuesta(agente="YHORGE", respuesta=resultado["respuesta"], fuente="ia")
    return AgenteRespuesta(agente="YHORGE", respuesta=_fallback_yhorge(contexto), fuente="reglas")

@app.post("/api/v1/agentes/alo", tags=["Agentes IA"], response_model=AgenteRespuesta)
def agente_alo(
    datos: AloConsulta,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_OPERACION))
):
    empresa_id = usuario_actual.eid
    cliente = db.query(Cliente).filter(Cliente.id == datos.cliente_id, Cliente.empresa_id == empresa_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado.")

    tickets = (
        db.query(Ticket, Producto.nombre)
        .join(Producto, Producto.id == Ticket.producto_id)
        .filter(Ticket.cliente_id == cliente.id, Ticket.empresa_id == empresa_id, Ticket.status == "procesado")
        .order_by(Ticket.created_at.desc())
        .limit(5)
        .all()
    )
    historial = [
        {"nombre": nombre, "monto_usd": float(t.monto_usd), "fecha": str(t.created_at)}
        for t, nombre in tickets
    ]

    # Saldo real de cartera (CxC) de este cliente, si tiene cuentas abiertas
    cxc_abiertas = db.query(CuentaPorCobrar).filter(
        CuentaPorCobrar.cliente_id == cliente.id,
        CuentaPorCobrar.empresa_id == empresa_id,
        CuentaPorCobrar.status != "pagada"
    ).all()
    saldo_cxc = sum((c.monto_total - c.monto_abonado for c in cxc_abiertas), Decimal("0"))

    # Últimas visitas de campo + su encuesta de marketing, si el negocio usa fuerza de ventas
    visitas = db.query(VisitaCliente).filter(
        VisitaCliente.cliente_id == cliente.id, VisitaCliente.empresa_id == empresa_id
    ).order_by(VisitaCliente.fecha_visita.desc()).limit(3).all()
    visitas_recientes = [
        {
            "fecha_visita": str(v.fecha_visita),
            "comentarios": v.comentarios,
            "encuesta": {
                "inventario_cliente": v.encuesta.inventario_cliente,
                "rotacion_productos": v.encuesta.rotacion_productos,
            } if v.encuesta else None,
        }
        for v in visitas
    ]

    # Últimos presupuestos/pedidos tomados (en campo o en caja)
    ordenes = db.query(OrdenVenta).filter(
        OrdenVenta.cliente_id == cliente.id, OrdenVenta.empresa_id == empresa_id
    ).order_by(OrdenVenta.created_at.desc()).limit(3).all()
    ordenes_recientes = [
        {"tipo": o.tipo, "total_usd": float(o.total_usd), "estatus": o.estatus, "fecha": str(o.created_at)}
        for o in ordenes
    ]

    contexto = {
        "cliente_nombre": cliente.nombre,
        "cliente_telefono": cliente.telefono,
        "historial_compras": historial,
        "item_faltante": datos.contexto,
        "saldo_cxc_actual": float(saldo_cxc),
        "visitas_recientes": visitas_recientes,
        "ordenes_recientes": ordenes_recientes,
        "pregunta_usuario": datos.pregunta,
    }

    resultado = consultar_agente(ALO_SYSTEM_PROMPT, contexto, datos.pregunta)
    if resultado["fuente"] == "ia" and resultado["respuesta"]:
        return AgenteRespuesta(agente="ALO", respuesta=resultado["respuesta"], fuente="ia")
    return AgenteRespuesta(agente="ALO", respuesta=_fallback_alo(contexto), fuente="reglas")


# ==============================================================================
# --- MÓDULO FUERZA DE VENTAS (GPS, Visitas, Cotizaciones, Rutas y Viáticos) ---
# ==============================================================================

# 1. Obtener configuración de marca de la empresa (branding y tipo de negocio)
@app.get("/api/v1/empresa/mi-config", tags=["Empresa"])
def obtener_mi_config_empresa(
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(get_current_user)
):
    empresa = db.query(Empresa).filter(Empresa.id == usuario_actual.eid).first()
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada.")
        
    # Definición de módulos activos por tipo de negocio (Feature Flags)
    if empresa.tipo_negocio == "agroferreteria":
        modulos = ["dashboard", "visitas", "rutas", "ficha", "crm", "estadisticas", "tesoreria", "cuentas"]
    else:
        modulos = [
            "dashboard", "ingreso", "balanza", "pos", "pedidos", "delivery",
            "crm", "estadisticas", "almacen", "ficha", "tesoreria", "cuentas"
        ]
        
    return {
        "id": empresa.id,
        "nombre_comercial": empresa.nombre_comercial,
        "tipo_negocio": empresa.tipo_negocio,
        "color_primario": empresa.color_primario,
        "color_secundario": empresa.color_secundario,
        "logo_url": empresa.logo_url,
        "modulos_habilitados": modulos
    }

# 2. Actualizar posición GPS del vendedor
@app.post("/api/v1/usuarios/gps", tags=["Fuerza de Ventas"])
def actualizar_gps_vendedor(
    datos: UsuarioGpsUpdate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(get_current_user)
):
    usuario = db.query(Usuario).filter(
        Usuario.id == usuario_actual.usuario_id,
        Usuario.empresa_id == usuario_actual.eid
    ).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    
    usuario.lat = datos.lat
    usuario.lng = datos.lng
    usuario.ubicacion_actualizada_en = datetime.datetime.now()
    try:
        db.commit()
        return {"status": "ok", "mensaje": "Ubicacion GPS actualizada con exito."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al actualizar ubicacion: {str(e)}")

# 3. Obtener ubicaciones de todos los vendedores de la empresa (para el mapa gerencial)
@app.get("/api/v1/usuarios/vendedores/ubicaciones", tags=["Fuerza de Ventas"], response_model=List[VendedorUbicacionResponse])
def listar_ubicaciones_vendedores(
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))
):
    vendedores = db.query(Usuario).filter(
        Usuario.empresa_id == usuario_actual.eid,
        Usuario.rol == "vendedor"
    ).all()
    return vendedores

# 4. Registrar visita de cliente con encuesta de marketing opcional
@app.post("/api/v1/visitas", tags=["Fuerza de Ventas"], response_model=VisitaClienteResponse, status_code=status.HTTP_201_CREATED)
def crear_visita_cliente(
    datos: VisitaClienteCreate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(get_current_user)
):
    cliente = db.query(Cliente).filter(
        Cliente.id == datos.cliente_id,
        Cliente.empresa_id == usuario_actual.eid
    ).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado o no pertenece a la empresa.")
        
    nueva_visita = VisitaCliente(
        empresa_id=usuario_actual.eid,
        vendedor_id=usuario_actual.usuario_id,
        cliente_id=datos.cliente_id,
        comentarios=datos.comentarios,
        lat=datos.lat,
        lng=datos.lng,
        foto_visita_url=datos.foto_visita_url
    )
    
    db.add(nueva_visita)
    db.flush()
    
    if datos.encuesta:
        nueva_encuesta = EncuestaMarketing(
            visita_id=nueva_visita.id,
            inventario_cliente=datos.encuesta.inventario_cliente,
            rotacion_productos=datos.encuesta.rotacion_productos,
            comentarios_adicionales=datos.encuesta.comentarios_adicionales
        )
        db.add(nueva_encuesta)
        
    try:
        db.commit()
        db.refresh(nueva_visita)
        return nueva_visita
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al registrar la visita: {str(e)}")

# 5. Obtener historial de visitas de un cliente
@app.get("/api/v1/visitas/cliente/{cliente_id}", tags=["Fuerza de Ventas"], response_model=List[VisitaClienteResponse])
def listar_visitas_cliente(
    cliente_id: int,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(get_current_user)
):
    visitas = db.query(VisitaCliente).filter(
        VisitaCliente.cliente_id == cliente_id,
        VisitaCliente.empresa_id == usuario_actual.eid
    ).order_by(VisitaCliente.fecha_visita.desc()).all()
    return visitas

# 6. Obtener todas las visitas de la empresa
@app.get("/api/v1/visitas", tags=["Fuerza de Ventas"], response_model=List[VisitaClienteResponse])
def listar_todas_visitas(
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(get_current_user)
):
    visitas = db.query(VisitaCliente).filter(
        VisitaCliente.empresa_id == usuario_actual.eid
    ).order_by(VisitaCliente.fecha_visita.desc()).all()
    return visitas

# 7. Crear presupuesto / backorder (OrdenVenta)
@app.post("/api/v1/ventas/ordenes", tags=["Fuerza de Ventas"], response_model=OrdenVentaResponse, status_code=status.HTTP_201_CREATED)
def crear_orden_venta(
    datos: OrdenVentaCreate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(get_current_user)
):
    cliente = db.query(Cliente).filter(
        Cliente.id == datos.cliente_id,
        Cliente.empresa_id == usuario_actual.eid
    ).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado o no pertenece a la empresa.")
        
    nueva_orden = OrdenVenta(
        empresa_id=usuario_actual.eid,
        vendedor_id=usuario_actual.usuario_id,
        cliente_id=datos.cliente_id,
        tipo=datos.tipo,
        total_usd=Decimal("0.00"),
        notas=datos.notas,
        estatus="pendiente"
    )
    
    db.add(nueva_orden)
    db.flush()
    
    total = Decimal("0.00")
    for item in datos.items:
        producto = db.query(Producto).filter(
            Producto.id == item.producto_id,
            Producto.empresa_id == usuario_actual.eid
        ).first()
        if not producto:
            raise HTTPException(status_code=404, detail=f"Producto id {item.producto_id} no encontrado.")
            
        monto_item = item.cantidad * item.precio_unitario
        total += monto_item
        
        nuevo_item = OrdenVentaItem(
            orden_venta_id=nueva_orden.id,
            producto_id=item.producto_id,
            cantidad=item.cantidad,
            precio_unitario=item.precio_unitario,
            monto_usd=monto_item
        )
        db.add(nuevo_item)
        
        # Si es un backorder (pedido) y el stock es cero, registrar peticion en el libro de faltantes CRM
        if datos.tipo == "pedido":
            # Calcular stock actual sumando lotes activos
            stock_disp = db.query(func.sum(Lote.cantidad_actual)).filter(
                Lote.producto_id == item.producto_id,
                Lote.empresa_id == usuario_actual.eid,
                Lote.status == "activo"
            ).scalar() or Decimal("0.00")
            
            if stock_disp <= 0:
                faltante_prev = db.query(PeticionFaltante).filter(
                    PeticionFaltante.cliente_id == datos.cliente_id,
                    PeticionFaltante.item.like(f"%{producto.nombre}%")
                ).first()
                if not faltante_prev:
                    db.add(PeticionFaltante(
                        cliente_id=datos.cliente_id,
                        item=f"{producto.nombre} (Solicitado por Vendedor)",
                        status="pendiente",
                        disponible=False
                    ))
                    
    nueva_orden.total_usd = total
    try:
        db.commit()
        db.refresh(nueva_orden)
        
        # Enriquecer nombres para respuesta
        res = OrdenVentaResponse.model_validate(nueva_orden)
        res.cliente_nombre = cliente.nombre
        for idx, it in enumerate(nueva_orden.items):
            prod = db.query(Producto).filter(Producto.id == it.producto_id).first()
            res.items[idx].producto_nombre = prod.nombre if prod else "Desconocido"
        return res
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al registrar orden de venta: {str(e)}")

# 8. Obtener órdenes de venta de un cliente
@app.get("/api/v1/ventas/ordenes/cliente/{cliente_id}", tags=["Fuerza de Ventas"], response_model=List[OrdenVentaResponse])
def listar_ordenes_cliente(
    cliente_id: int,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(get_current_user)
):
    ordenes = db.query(OrdenVenta).filter(
        OrdenVenta.cliente_id == cliente_id,
        OrdenVenta.empresa_id == usuario_actual.eid
    ).order_by(OrdenVenta.created_at.desc()).all()
    
    resultado = []
    for o in ordenes:
        res = OrdenVentaResponse.model_validate(o)
        cli = db.query(Cliente).filter(Cliente.id == o.cliente_id).first()
        res.cliente_nombre = cli.nombre if cli else "Desconocido"
        for idx, it in enumerate(o.items):
            prod = db.query(Producto).filter(Producto.id == it.producto_id).first()
            res.items[idx].producto_nombre = prod.nombre if prod else "Desconocido"
        resultado.append(res)
    return resultado

# 9. Obtener todas las órdenes de venta
@app.get("/api/v1/ventas/ordenes", tags=["Fuerza de Ventas"], response_model=List[OrdenVentaResponse])
def listar_todas_ordenes(
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(get_current_user)
):
    ordenes = db.query(OrdenVenta).filter(
        OrdenVenta.empresa_id == usuario_actual.eid
    ).order_by(OrdenVenta.created_at.desc()).all()
    
    resultado = []
    for o in ordenes:
        res = OrdenVentaResponse.model_validate(o)
        cli = db.query(Cliente).filter(Cliente.id == o.cliente_id).first()
        res.cliente_nombre = cli.nombre if cli else "Desconocido"
        for idx, it in enumerate(o.items):
            prod = db.query(Producto).filter(Producto.id == it.producto_id).first()
            res.items[idx].producto_nombre = prod.nombre if prod else "Desconocido"
        resultado.append(res)
    return resultado

# 10. Actualizar estado de una orden de venta (gerencia)
@app.put("/api/v1/ventas/ordenes/{orden_id}/estado", tags=["Fuerza de Ventas"], response_model=OrdenVentaResponse)
def actualizar_estado_orden_venta(
    orden_id: int,
    estatus: str,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))
):
    orden = db.query(OrdenVenta).filter(
        OrdenVenta.id == orden_id,
        OrdenVenta.empresa_id == usuario_actual.eid
    ).first()
    if not orden:
        raise HTTPException(status_code=404, detail="Orden de venta no encontrada.")
        
    orden.estatus = estatus
    try:
        db.commit()
        db.refresh(orden)
        res = OrdenVentaResponse.model_validate(orden)
        cli = db.query(Cliente).filter(Cliente.id == orden.cliente_id).first()
        res.cliente_nombre = cli.nombre if cli else "Desconocido"
        for idx, it in enumerate(orden.items):
            prod = db.query(Producto).filter(Producto.id == it.producto_id).first()
            res.items[idx].producto_nombre = prod.nombre if prod else "Desconocido"
        return res
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al actualizar orden: {str(e)}")

# 11. Crear plan de ruta de vendedor
@app.post("/api/v1/rutas", tags=["Fuerza de Ventas"], response_model=RutaVendedorResponse, status_code=status.HTTP_201_CREATED)
def crear_ruta_vendedor(
    datos: RutaVendedorCreate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(get_current_user)
):
    nueva_ruta = RutaVendedor(
        empresa_id=usuario_actual.eid,
        vendedor_id=usuario_actual.usuario_id,
        nombre_ruta=datos.nombre_ruta,
        fecha_inicio=datos.fecha_inicio,
        fecha_fin=datos.fecha_fin,
        estatus="pendiente_aprobacion",
        monto_viaticos_solicitado=datos.monto_viaticos_solicitado,
        monto_viaticos_aprobado=Decimal("0.00"),
        detalles_viaticos=datos.detalles_viaticos
    )
    
    db.add(nueva_ruta)
    db.flush()
    
    for act in datos.actividades:
        nueva_act = RutaActividad(
            ruta_id=nueva_ruta.id,
            cliente_id=act.cliente_id,
            fecha_planificada=act.fecha_planificada,
            actividad_planificada=act.actividad_planificada,
            ejecutada=False
        )
        db.add(nueva_act)
        
    try:
        db.commit()
        db.refresh(nueva_ruta)
        
        res = RutaVendedorResponse.model_validate(nueva_ruta)
        vendedor = db.query(Usuario).filter(Usuario.id == nueva_ruta.vendedor_id).first()
        res.vendedor_nombre = vendedor.nombre if vendedor else "Desconocido"
        for idx, act_obj in enumerate(nueva_ruta.actividades):
            if act_obj.cliente_id:
                cli = db.query(Cliente).filter(Cliente.id == act_obj.cliente_id).first()
                res.actividades[idx].cliente_nombre = cli.nombre if cli else None
        return res
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al registrar ruta: {str(e)}")

# 12. Listar rutas de la empresa (o del vendedor actual)
@app.get("/api/v1/rutas", tags=["Fuerza de Ventas"], response_model=List[RutaVendedorResponse])
def listar_rutas(
    vendedor_id: Optional[int] = None,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(get_current_user)
):
    query = db.query(RutaVendedor).filter(RutaVendedor.empresa_id == usuario_actual.eid)
    
    if usuario_actual.rol == "vendedor":
        query = query.filter(RutaVendedor.vendedor_id == usuario_actual.usuario_id)
    elif vendedor_id:
        query = query.filter(RutaVendedor.vendedor_id == vendedor_id)
        
    rutas = query.order_by(RutaVendedor.fecha_inicio.desc()).all()
    
    resultado = []
    for r in rutas:
        res = RutaVendedorResponse.model_validate(r)
        vend = db.query(Usuario).filter(Usuario.id == r.vendedor_id).first()
        res.vendedor_nombre = vend.nombre if vend else "Desconocido"
        for idx, act_obj in enumerate(r.actividades):
            if act_obj.cliente_id:
                cli = db.query(Cliente).filter(Cliente.id == act_obj.cliente_id).first()
                res.actividades[idx].cliente_nombre = cli.nombre if cli else None
        resultado.append(res)
    return resultado

# 13. Aprobación/Rechazo de ruta y viáticos (gerencia)
@app.put("/api/v1/rutas/{ruta_id}/estado", tags=["Fuerza de Ventas"], response_model=RutaVendedorResponse)
def actualizar_estado_ruta(
    ruta_id: int,
    datos: RutaEstadoUpdate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(verificar_rol(ROLES_GESTION))
):
    ruta = db.query(RutaVendedor).filter(
        RutaVendedor.id == ruta_id,
        RutaVendedor.empresa_id == usuario_actual.eid
    ).first()
    if not ruta:
        raise HTTPException(status_code=404, detail="Ruta no encontrada.")
        
    ruta.estatus = datos.estatus
    if datos.monto_viaticos_aprobado is not None:
        ruta.monto_viaticos_aprobado = datos.monto_viaticos_aprobado
    if datos.comentarios_gerente is not None:
        ruta.comentarios_gerente = datos.comentarios_gerente
        
    try:
        db.commit()
        db.refresh(ruta)
        
        res = RutaVendedorResponse.model_validate(ruta)
        vend = db.query(Usuario).filter(Usuario.id == ruta.vendedor_id).first()
        res.vendedor_nombre = vend.nombre if vend else "Desconocido"
        for idx, act_obj in enumerate(ruta.actividades):
            if act_obj.cliente_id:
                cli = db.query(Cliente).filter(Cliente.id == act_obj.cliente_id).first()
                res.actividades[idx].cliente_nombre = cli.nombre if cli else None
        return res
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al actualizar estado de ruta: {str(e)}")

# 14. Reportar avance de actividad diaria (vendedor)
@app.post("/api/v1/rutas/actividades/{actividad_id}/avance", tags=["Fuerza de Ventas"], response_model=RutaActividadResponse)
def actualizar_avance_actividad(
    actividad_id: int,
    datos: ActividadAvanceUpdate,
    db: Session = Depends(get_db),
    usuario_actual: TokenData = Depends(get_current_user)
):
    actividad = db.query(RutaActividad).join(RutaVendedor).filter(
        RutaActividad.id == actividad_id,
        RutaVendedor.empresa_id == usuario_actual.eid
    ).first()
    
    if not actividad:
        raise HTTPException(status_code=404, detail="Actividad no encontrada.")
        
    if usuario_actual.rol == "vendedor" and actividad.ruta.vendedor_id != usuario_actual.usuario_id:
        raise HTTPException(status_code=403, detail="No tienes permisos para modificar esta actividad.")
        
    actividad.ejecutada = datos.ejecutada
    if datos.comentarios_avance is not None:
        actividad.comentarios_avance = datos.comentarios_avance
    if datos.foto_soporte_url is not None:
        actividad.foto_soporte_url = datos.foto_soporte_url
    if datos.factura_soporte_monto is not None:
        actividad.factura_soporte_monto = datos.factura_soporte_monto
        
    try:
        db.commit()
        db.refresh(actividad)
        
        res = RutaActividadResponse.model_validate(actividad)
        if actividad.cliente_id:
            cli = db.query(Cliente).filter(Cliente.id == actividad.cliente_id).first()
            res.cliente_nombre = cli.nombre if cli else None
        return res
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al reportar avance: {str(e)}")


# --- Servir el Frontend ya compilado (npm run build -> frontend/dist) ---
# Se registra al final para que no choque con ninguna ruta /api/v1/... de arriba.
# El catch-all devuelve cualquier archivo estático existente (assets, favicon, etc.)
# y si no existe, cae en index.html para que React Router resuelva la navegación
# del lado del cliente (ej. refrescar en /dashboard).
_frontend_dist = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")
if os.path.isdir(_frontend_dist):
    @app.get("/{full_path:path}", include_in_schema=False)
    def servir_frontend(full_path: str):
        candidato = os.path.join(_frontend_dist, full_path)
        if full_path and os.path.isfile(candidato):
            return FileResponse(candidato)
        return FileResponse(os.path.join(_frontend_dist, "index.html"))
