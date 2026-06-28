# Consola SaaS Maestro: identidad clara + catálogo de planes — Diseño

## Contexto

La "Consola SaaS Maestro" (`frontend/src/components/ModuloEmpresas.tsx`, visible
solo para `rol === "propietario"`) es el panel donde se registran las empresas
clientes del SaaS 3Q Nexus. El usuario probó el formulario actual y reportó 8
problemas. Este spec resuelve **2 de las 5 piezas independientes** en las que
se descompuso el pedido completo (ver
[[2026-06-27-landing-3qsolutions-design]] para el contexto del producto y los
3 planes Básico/Pro/Max que ya existen en el landing):

1. **Identidad y contacto claros** — separar datos del dueño de los datos de
   la empresa, y eliminar la confusión del flujo de credenciales actual.
2. **Catálogo de Planes editable** — Básico/Pro/Max como catálogo real en
   base de datos (con módulos, agentes y precio), no un array fijo en código.

**Fuera de alcance de este spec** (son sub-proyectos propios, a diseñar
después): subir el logo como archivo en vez de URL, la persistencia real y
edición de empresas ya creadas (la tabla "Empresas" del panel sigue siendo
local/mock salvo la llamada de creación), y el módulo de pagos/comprobantes.

## Hallazgo clave que motiva el diseño

El campo "Usuario Administrador Inicial" del formulario actual (`username_admin`
en el payload) **se envía al backend pero nunca se usa** — el endpoint
`POST /api/v1/auth/registrar-saas` (`app/main.py`) crea el `Usuario` solo con
`nombre`, `email` y `password_hash`; no existe columna `username` en el modelo
`Usuario` (`app/models/usuario.py`). El login siempre es por correo
(`POST /api/v1/auth/login` con `{email, password}`). Por eso el formulario se
sentía confuso: pedía 4 campos para una sola identidad de acceso.

## Cambios de modelo

### `app/models/usuario.py`
- `+ telefono: Mapped[str | None] = mapped_column(String(20), nullable=True)`
  — teléfono personal del dueño/usuario, distinto del teléfono de la empresa.

### `app/models/empresa.py`
- `+ plan_id: Mapped[int | None] = mapped_column(ForeignKey("plan.id"), nullable=True)`
- `+ sitio_web: Mapped[str | None] = mapped_column(String(255), nullable=True)`
- `+ instagram: Mapped[str | None] = mapped_column(String(100), nullable=True)`
- `+ facebook: Mapped[str | None] = mapped_column(String(100), nullable=True)`
- `+ whatsapp: Mapped[str | None] = mapped_column(String(20), nullable=True)`
- `+ tiktok: Mapped[str | None] = mapped_column(String(100), nullable=True)`
- `+ x: Mapped[str | None] = mapped_column(String(100), nullable=True)`
- `+ modulos_override: Mapped[dict | None] = mapped_column(JSON, nullable=True)`

### Hallazgo adicional: el toggle de módulos no aplicaba de verdad

Al diseñar el catálogo se descubrió que `modulos_habilitados` (devuelto por
`GET /api/v1/empresa/mi-config`) se calcula **siempre** a partir de
`NEGOCIO_CONFIG[tipo_negocio]["modulos_base"]` (`app/core/negocio_config.py`),
ignorando por completo cualquier matriz de módulos marcada en el formulario.
El toggle era puramente decorativo. Este spec lo corrige: `modulos_override`
en `Empresa` guarda el resultado de la matriz (precargada desde el plan,
ajustable por empresa); los dos endpoints que construyen
`EmpresaConfigResponse` (`app/main.py:5110` y `:5231`) pasan a calcular
`modulos_habilitados` como la combinación de `modulos_base` con
`modulos_override` cuando este último no es `None` — si `modulos_override`
trae `{"pos": false}`, ese módulo se quita de la lista aunque
`tipo_negocio` lo incluya; si trae `{"crm": true}` y `tipo_negocio` no lo
incluye, se agrega.

Todas nullable porque las empresas existentes no tienen estos datos.

### `app/models/plan.py` (nuevo)
```python
class Plan(Base):
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)  # "Básico" | "Pro" | "Max"
    precio_mensual: Mapped[float] = mapped_column(nullable=False)
    limite_usuarios: Mapped[int] = mapped_column(nullable=False)
    modulos: Mapped[dict] = mapped_column(JSON, nullable=False)  # {"dashboard": true, "pos": true, ...}
    agente_vale_incluido: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    agente_yhorge_incluido: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    agente_alo_incluido: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
```

Seed inicial (vía script de migración, igual que las migraciones existentes
en la raíz del repo, ej. `migrate_rebranding.py`):

| nombre | precio_mensual | limite_usuarios | módulos | vale | yhorge | alo |
|---|---|---|---|---|---|---|
| Básico | 29 | 3 | dashboard, ingreso, pos | false | false | false |
| Pro | 79 | 10 | + pedidos, delivery, ficha | false | false | true |
| Max | 149 | 25 | todos los de `MODULOS_ERP` | true | true | true |

Estos valores son el punto de partida editable, no son contractuales — se
pueden ajustar desde la pantalla de catálogo (sección 3).

## Endpoints nuevos/modificados (`app/main.py`)

- `GET /api/v1/planes` — lista los 3 planes con todos sus campos. Requiere
  sesión autenticada (cualquier rol; el frontend ya gatea la pantalla que lo
  usa a `propietario`, igual que hoy gatea la consola completa).
- `PUT /api/v1/planes/{id}` — actualiza `precio_mensual`, `limite_usuarios`,
  `modulos`, y los 3 booleans de agentes. Requiere `rol == "propietario"`
  (`verificar_rol`, mismo patrón ya usado en otros endpoints administrativos
  del archivo).
- `POST /api/v1/auth/registrar-saas` (`RegistroEmpresaAdmin` en
  `app/schemas.py`):
  - Se agregan campos opcionales: `plan_id`, `sitio_web`, `instagram`,
    `facebook`, `whatsapp`, `tiktok`, `x`, `telefono_dueno`.
  - Se elimina `username_admin` del schema (deja de aceptarse; el frontend
    deja de enviarlo).
  - El handler guarda `telefono_dueno` en `nuevo_usuario.telefono` y el resto
    de los campos nuevos directo en `nueva_empresa`.

## Frontend (`frontend/src/components/ModuloEmpresas.tsx`)

### Carga del catálogo
Al montar el componente, `useEffect` llama `GET /api/v1/planes` y guarda el
resultado en estado (`planes: Plan[]`). El `<select>` de "Plan de Suscripción"
en Alta de Empresa pasa a iterar sobre `planes` (ya no sobre el array
`PLANES` hardcodeado, que se elimina).

### "Alta de Empresa" — reorganizado en 3 bloques
1. **Datos de la Empresa**: RIF, Razón Social, Teléfono, Dirección, Tipo de
   Negocio, Nombre Reducido, Sitio Web, Instagram, Facebook, WhatsApp,
   TikTok, X, color primario/secundario, URL del logo (sin cambios, sigue
   siendo URL — la subida de archivo es un sub-proyecto aparte).
2. **Datos del Dueño** (reemplaza la sección "Creación de Credenciales
   Maestras"): Nombre completo, Correo (con nota "el dueño inicia sesión con
   este correo"), Teléfono, Clave Temporal (con la misma nota ya existente de
   cambio obligatorio en el primer login). Se elimina el campo "Usuario
   Administrador Inicial".
3. **Plan, Cronómetro, Módulos Autorizados, Guías de IA** (sin cambios de
   estructura) — pero ahora: al cambiar el `<select>` de Plan, un
   `useEffect`/handler busca el plan elegido en `planes` y sobrescribe el
   estado `modulos`, `agentesIA` y `limiteUsuarios` con los valores de ese
   plan. El usuario puede seguir tocando los toggles después — el plan solo
   precarga, no bloquea.

### Nueva sub-sección "Catálogo de Planes"
Se agrega **antes** del formulario de Alta de Empresa, dentro del mismo
componente `ModuloEmpresas`: 3 tarjetas (una por plan), cada una con:
- Input numérico de precio mensual.
- Input numérico de límite de usuarios.
- La misma grilla de toggles de módulos (`MODULOS_ERP`) y agentes
  (`AGENTES_IA`) ya usada en Alta de Empresa, reutilizada como un
  subcomponente local `MatrizModulosAgentes` (extraído del JSX repetido que
  hoy vive inline en el formulario, para no duplicarlo entre el catálogo y
  el alta).
- Botón "Guardar cambios del plan" → `PUT /api/v1/planes/{id}` con los
  valores actuales de esa tarjeta; muestra un mensaje de éxito/error breve.

## Testing / verificación

- Backend: arrancar con `uvicorn` (sin `--reload`, según convención del
  proyecto), `GET /api/v1/planes` debe devolver los 3 planes sembrados;
  `PUT /api/v1/planes/{id}` debe persistir un cambio de precio y reflejarse
  en una siguiente lectura; `POST /api/v1/auth/registrar-saas` con los
  campos nuevos debe crear la empresa con `plan_id`/redes/web guardados y el
  usuario con `telefono` guardado.
- Frontend: `npm run build` sin errores de TypeScript; revisión manual en
  `npm run dev` logueado como propietario — el catálogo de planes carga y
  guarda cambios, el selector de plan en Alta de Empresa precarga módulos al
  cambiar de plan y sigue permitiendo ajustarlos, y el bloque "Datos del
  Dueño" ya no tiene el campo de usuario suelto.
