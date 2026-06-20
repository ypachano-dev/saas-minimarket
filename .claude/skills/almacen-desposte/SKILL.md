---
name: almacen-desposte
description: Use when working on Gestión Almacén (recepción de mercancía, auditorías de inventario, stock proyectado) or Desposte (descomponer un producto entero en sus cortes) in this MiniMarket SaaS, in either the Almacén module or Balanza Digital.
---

# Gestión Almacén: Recepción, Auditorías, Stock Proyectado y Desposte

## Arquitectura

- **`ModuloAlmacen.tsx`** es un shell de pestañas que reutiliza componentes existentes (`CatalogoProductos`, `ModuloDesposte`) junto con tres nuevos: `AlmacenIngreso.tsx`, `AlmacenAuditorias.tsx`, `AlmacenProyeccion.tsx`. `ModuloDesposte.tsx` también se monta como modal dentro de `ModuloBalanza.tsx` (botón "🥩 Desposte" junto al selector de departamento) — es el mismo componente en los dos sitios, sin duplicar lógica.
- **Todas las operaciones que mueven stock reutilizan el mismo patrón FEFO** ya establecido en `crear_ticket` (`app/main.py`): ordenar lotes activos por `fecha_vencimiento asc, fecha_ingreso asc`, descontar lote por lote, marcar `agotado` al llegar a 0. Lo reusan: Desposte (consume el producto origen), y el cierre de Auditoría (cuando hay faltante).
- **Desposte es 100% libre, sin plantillas/recetas guardadas** (decisión explícita del usuario) — cada operación se captura manualmente: producto origen + peso, lista de cortes resultantes + peso cada uno. La merma se recalcula siempre en el servidor (`peso_origen - sum(pesos_destino)`), nunca se confía en el valor que mande el cliente.
- **"Ingreso de Mercancía" y "Descargas" son el mismo flujo** (confirmado con el usuario): `RecepcionMercancia` + `RecepcionMercanciaItem`. Si se liga a una `OrdenCompra` existente (`orden_compra_id`), esa orden pasa a `estatus="Recibido"` automáticamente al guardar.
- **Auditoría de Inventario**: al abrir (`POST /api/v1/almacen/auditorias`) toma una foto de `stock_total` por producto (reutiliza `_stock_total_por_producto`, mismo patrón que las alertas de stock bajo del Dashboard). Se puede filtrar por `linea` para auditar solo un departamento. Al cerrar (`POST .../cerrar`), las diferencias positivas crean un `Lote` de ajuste nuevo (`codigo_lote="AJUSTE-AUD-{id}"`); las negativas se descuentan FEFO igual que una venta.
- **Stock Proyectado** (`GET /api/v1/almacen/proyeccion`) reutiliza el mismo patrón de velocidad de venta que `_calcular_estadisticas`'s `top_productos` (suma `Ticket.peso` de los últimos 30 días, `status="procesado"`). Cobertura de reorden por defecto: 7 días.

## Gotcha encontrado y corregido (importante para no repetir)

**`FichaProducto.tsx` ya enviaba `tipo_venta`, `factor_merma` y `peso` al crear un producto desde mucho antes de que el modelo `Producto` los tuviera.** FastAPI/Pydantic descarta en silencio cualquier campo que el frontend envíe pero que no esté declarado en el schema — no hay error, el campo simplemente nunca se persiste. Esto dejó al selector de "Producto de Origen" en `ModuloDesposte.tsx` (que filtra por `producto.tipo_venta === "peso"`) permanentemente vacío, sin que nada lo señalara como roto.

**Lección**: cuando un componente de frontend ya existe y llama a un endpoint, **siempre comparar el payload exacto que envía contra el schema Pydantic real del backend**, campo por campo — no asumir que porque el formulario "se ve completo" todos sus campos efectivamente se guardan. Esto aplica especialmente a UI que parece terminada pero nunca se conectó realmente (ver también el caso de `ModuloDesposte.tsx`, que llamaba a `POST /api/v1/desposte`, un endpoint que nunca existió).

## Gotchas adicionales

- `Producto.tipo_venta` ("unidad" | "peso") y `factor_merma` (0-100, opcional) ahora sí existen en el modelo y se pueden editar con `PUT /api/v1/productos/{id}` (antes no existía ningún endpoint de edición de producto).
- `OrdenCompra.proveedor` sigue siendo un `String` libre, no un FK a `Proveedor` — inconsistencia heredada, no corregida en este trabajo. `RecepcionMercancia.proveedor_id` sí es un FK propio; al prellenar el formulario de Ingreso desde una Orden de Compra pendiente, no hay match automático garantizado entre el nombre de la orden y el `Proveedor.id`.
- `ROLES_DESPOSTE = ["admin", "propietario", "carnicero", "verdulero", "charcutero"]` en `app/main.py` — único grupo de roles que incluye los roles de departamento de Balanza Digital en el backend (antes esos roles solo se validaban en el frontend).
