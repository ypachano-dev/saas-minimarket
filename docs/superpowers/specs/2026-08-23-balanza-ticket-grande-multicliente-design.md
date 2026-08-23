# Balanza Digital: ticket grande + cambio rápido entre clientes — Diseño

## Contexto

En `frontend/src/components/ModuloBalanza.tsx` la estación es operada en la
práctica por 4-5 empleados desde una sola computadora física (no hay
múltiples estaciones): un cliente llega, un empleado lo atiende, puede
irse, otro empleado retoma a ese mismo cliente o atiende a otro distinto, y
así en paralelo mientras llegan más clientes al mostrador.

El componente ya soporta esto a nivel de datos — `pendientesGlobales` trae
**todos** los tickets pendientes de la empresa (no solo los del cliente
identificado), agrupados por cliente en `pendientesPorCliente`, y
`atenderCliente(clienteId)` permite retomar a cualquiera de ellos sin volver
a pedir la cédula. Pero visualmente esa función queda enterrada: la lista de
clientes con pedidos pendientes es una grilla secundaria, y el detalle del
ticket que se está armando ("Visita Actual") vive comprimido en una
columna angosta de 1/3 de ancho (`xl:col-span-1`), compartida con el
historial de compras pasadas.

El usuario probó la pantalla y pidió invertir el balance visual: el ticket
en curso debe ser lo grande y protagonista (es lo que se mira todo el día),
y el catálogo de productos — que solo se usa para clickear un producto antes
de pesar — puede vivir más compacto, cerca de la balanza.

## Alcance

Este spec es **puramente de reorganización visual (JSX/layout)** sobre
`ModuloBalanza.tsx`. No se toca:
- Estado (`useState`/`useMemo`/`useCallback` existentes se reutilizan tal
  cual, sin renombrar ni agregar campos nuevos).
- Llamadas a la API ni endpoints.
- Lógica de negocio (agrupación de tickets, cálculo de peso/monto, alta
  rápida de producto, desposte, encuesta de calidad).

Fuera de alcance: cualquier cambio a `ModuloDesposte`, a los endpoints de
`/api/v1/tickets`, o a otros módulos (Caja, CRM).

## Layout actual (referencia)

```
Header
Grid 1/3 - 2/3
├── Columna izquierda (col-span-1)
│   ├── Identificar Cliente
│   └── Balanza Electrónica
└── Columna derecha (col-span-2)
    ├── Selección de Departamento (tabs + desposte pendiente + toggle historial)
    ├── Pedidos Pendientes en Balanza (grilla de tarjetas por cliente)
    └── Grid interno xl:1/3 - 2/3
        ├── Catálogo del Departamento (xl:col-span-2)
        └── Historial Cliente (xl:col-span-1)
            ├── Visita Actual (tickets en balanza del cliente activo)
            └── Historial (últimas compras) + sugerencia al vendedor
```

## Layout nuevo

```
Header
Grid 1/3 - 2/3 (se mantiene la proporción de columnas)
├── Columna izquierda (col-span-1)
│   ├── Identificar Cliente                    (sin cambios)
│   ├── Balanza Electrónica                    (sin cambios)
│   └── Catálogo del Departamento               ← se mueve aquí
└── Columna derecha (col-span-2)
    ├── Selección de Departamento               (sin cambios)
    ├── Tickets Activos                         ← ex "Pedidos Pendientes en Balanza", ahora en formato píldoras
    └── Visita Actual + Historial de Compras    ← panel grande, ancho completo de la columna
```

### 1. Catálogo del Departamento → columna izquierda

Se retira del grid interno de la columna derecha y se agrega como tercera
`<section>` de la columna izquierda, debajo de "Balanza Electrónica".

- Mismo componente/JSX interno (placeholder "Identifique un Cliente" cuando
  `!cliente`, estado de carga, estado vacío con botón "+ Agregar producto",
  botón de alta rápida, badge de conteo de productos).
- Único cambio visual: la grilla de tarjetas de producto pasa de
  `grid-cols-1 md:grid-cols-2` a **una sola columna** (`grid-cols-1`), porque
  el ancho disponible ahora es 1/3 del contenedor en vez de 2/3. Las tarjetas
  conservan su misma altura y contenido (código, stock, nombre, precio/kg).

### 2. "Pedidos Pendientes en Balanza" → "Tickets Activos" (barra de píldoras)

Se reemplaza la grilla `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` de
tarjetas por una fila horizontal (`flex gap-2 overflow-x-auto`) de píldoras,
una por cada entrada de `pendientesPorCliente` (mismo dato, mismo cálculo,
sin cambios en el `useMemo`).

Cada píldora conserva la misma información que la tarjeta actual — nombre
del cliente, cantidad de tickets, monto total — condensada horizontalmente,
y el mismo `onClick={() => atenderCliente(p.cliente_id)}`. La píldora del
`cliente` activo se resalta igual que hoy (fondo azul + badge "Activo").

Esta sección se reubica: en vez de ir después de "Selección de
Departamento" y antes del grid de catálogo/historial, pasa a ser el
encabezado del nuevo panel grande de "Visita Actual" (ver punto 3) — visual
y funcionalmente son la misma idea ("¿a qué cliente le estoy pesando algo
ahora?"), así que viven pegados.

Sigue siendo **siempre visible**, sin toggle, igual que hoy (para que un
ticket con pesajes pendientes nunca "desaparezca" al cambiar de cliente o
departamento — comportamiento ya documentado en el código existente).

### 3. Panel grande "Visita Actual" + Historial de Compras

Ocupa el ancho completo de la columna derecha (donde antes vivía el grid
interno Catálogo/Historial). Es la fusión de dos secciones que hoy existen
separadas dentro de la tarjeta "Historial Cliente":

1. **Tickets Activos** (barra de píldoras, punto 2) como encabezado del
   panel.
2. **Visita Actual (Tickets en Balanza)** — la lista de `ticketsAgrupados`
   del cliente activo, con los mismos controles ya existentes: ajustar peso
   con `+`/`−`/input directo (`actualizarPesoGrupo`), anular grupo
   (`cancelarGrupoPendiente`), ver/imprimir comprobante. Mismo placeholder
   "Ningún ticket pesado pendiente" y mismo estado de carga.
   - Cambio visual: las tarjetas de ticket pasan de una columna angosta
     (`max-h-48` en una tarjeta de ~1/3 de ancho) a un grid de 2 columnas en
     pantallas grandes (`md:grid-cols-2`) dentro del panel ancho, para
     aprovechar el espacio — más texto visible sin truncar, botones más
     grandes.
3. **Historial (Últimas Compras)** + **Sugerencia al Vendedor** — debajo de
   "Visita Actual", separado por el mismo `border-t` que ya existe hoy.
   Mismo contenido y lógica (`historialCompras`, `limiteHistorial`, botón
   "Ver más", encuesta de calidad vía `openSurveyModal`), solo con más
   ancho disponible — las tarjetas de compras pasadas también pasan a
   `md:grid-cols-2` dentro del panel ancho, igual que las de "Visita
   Actual".

Cuando `!cliente`: el panel completo muestra el mismo placeholder "Sin
Cliente" que hoy tiene la tarjeta "Historial Cliente", pero ahora a tamaño
grande. La barra de "Tickets Activos" (punto 2) se mantiene visible arriba
incluso sin cliente identificado, igual que hoy — es lo que permite
retomar a un cliente sin buscar su cédula de nuevo.

## Testing / verificación

- Frontend: `npm run build` sin errores de TypeScript.
- Manual en `npm run dev`: con 2+ clientes con pesajes pendientes,
  confirmar que las píldoras de "Tickets Activos" alternan correctamente el
  cliente activo (sin recargar la página), que el catálogo debajo de la
  balanza sigue filtrando por departamento y permite seleccionar producto y
  pesar, y que anular/ajustar peso desde el panel grande sigue funcionando
  igual que antes del cambio de layout.
