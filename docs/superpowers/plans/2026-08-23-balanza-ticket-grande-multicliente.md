# Balanza: ticket grande + cambio rápido entre clientes — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar el layout de `frontend/src/components/ModuloBalanza.tsx` para que el "Catálogo del Departamento" viva en la columna izquierda (debajo de la balanza) y el ticket en curso ("Visita Actual") ocupe un panel grande en la columna derecha, con una barra de píldoras arriba para saltar entre clientes con pesajes pendientes.

**Architecture:** Reorganización pura de JSX dentro de un único componente. No se crean archivos ni estado nuevo; se reutilizan `cliente`, `productos`, `pendientesPorCliente`, `ticketsAgrupados`, `historialCompras`, `atenderCliente`, `cancelarGrupoPendiente`, `actualizarPesoGrupo`, `openSurveyModal` tal como ya existen.

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind CSS (clases utilitarias inline, sin CSS modules).

## Global Constraints

- Spec de referencia: `docs/superpowers/specs/2026-08-23-balanza-ticket-grande-multicliente-design.md`.
- Es reorganización visual pura: **no** se modifica estado (`useState`/`useMemo`/`useCallback`), **no** se agregan/quitan llamadas a `apiClient`, **no** se toca `ModuloDesposte` ni ningún otro componente.
- Cada edición usa el tool `Edit` con `old_string`/`new_string` exactos — los bloques de este plan ya están verificados contra el archivo actual (líneas y clases confirmadas únicas con `grep` antes de escribir este plan).
- Verificación de cada tarea: `npm run build` (desde `frontend/`) debe terminar sin errores de TypeScript. No hay suite de tests automatizados para componentes React en este repo — la verificación funcional es manual en `npm run dev`, según la convención ya usada en specs anteriores de este proyecto.
- Un commit por tarea, seleccionando explícitamente el archivo modificado (`git add frontend/src/components/ModuloBalanza.tsx`) — **no** usar `git add -A` (el repo puede tener otros cambios sueltos en el árbol de trabajo).

---

### Task 1: Mover "Catálogo del Departamento" a la columna izquierda

**Files:**
- Modify: `frontend/src/components/ModuloBalanza.tsx`

**Interfaces:**
- Consumes: estado y funciones ya existentes en el componente (`cliente`, `productos`, `errorText`, `loadingProds`, `deptActivo`, `productoSel`, `setProductoSel`, `setMostrarAltaRapida`, `fmt`, `fmtKg`). No se agrega nada nuevo.
- Produces: dos `<section>` independientes en la columna izquierda (Identificar Cliente, Balanza Electrónica, Catálogo) y la sección "Historial Cliente" un-nested (deja de estar dentro del grid `xl:grid-cols-3`, pasa a ser un `<section>` de ancho completo en la columna derecha) — de esto dependen las Tasks 2 y 3.

- [ ] **Step 1: Insertar el Catálogo del Departamento en la columna izquierda, debajo de la Balanza Electrónica**

Con el tool `Edit` sobre `frontend/src/components/ModuloBalanza.tsx`:

`old_string`:
```
          </section>

        </div>

        {/* RIGHT COLUMN: DEPARTMENT SELECTOR & CATALOG / HISTORY GRID */}
        <div className="lg:col-span-2 space-y-6">
```

`new_string`:
```
          </section>

          {/* PRODUCT LISTING CARD (moved here from the right column: columna angosta, grilla de una sola columna) */}
          <section className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4 min-h-[400px] flex flex-col">
            {!cliente ? (
              <div className="flex-grow flex flex-col items-center justify-center text-center p-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <span className="text-5xl mb-3">👤</span>
                <h4 className="font-bold text-slate-700">Identifique un Cliente</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                  Busque o registre un cliente en la sección de la izquierda para desplegar el catálogo de productos y realizar pesajes.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-slate-50 pb-3">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">📦 Catálogo del Departamento</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Seleccione el producto pesado en la balanza</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1 rounded-full">
                      {productos.length} Productos
                    </span>
                    <button
                      type="button"
                      onClick={() => setMostrarAltaRapida(true)}
                      className="bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-100 hover:border-emerald-600 text-xs font-bold px-3 py-1 rounded-full transition-all"
                    >
                      + Agregar producto
                    </button>
                  </div>
                </div>

                {errorText && <p className="text-sm font-semibold text-rose-600 bg-rose-50 p-3 rounded-2xl">{errorText}</p>}

                {loadingProds ? (
                  <div className="flex-1 flex items-center justify-center">
                    <span className="text-slate-400 font-medium animate-pulse">Cargando productos de la estación...</span>
                  </div>
                ) : productos.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <span className="text-4xl">📭</span>
                    <h4 className="font-bold text-slate-700 mt-3">No hay productos cargados</h4>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm">
                      Debe agregar productos con la línea o departamento "{deptActivo}" en el módulo de Ingreso de Datos, o crear uno rápido aquí mismo.
                    </p>
                    <button
                      type="button"
                      onClick={() => setMostrarAltaRapida(true)}
                      className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all"
                    >
                      + Agregar producto a "{deptActivo}"
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {productos.map((prod) => {
                      const seleccionado = productoSel?.id === prod.id;
                      return (
                        <button
                          key={prod.id}
                          type="button"
                          onClick={() => setProductoSel(prod)}
                          className={`p-4 rounded-2xl text-left border transition-all flex flex-col justify-between h-32 ${
                            seleccionado
                              ? "bg-blue-600 text-white border-blue-600 shadow-md scale-[1.02]"
                              : "bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${seleccionado ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"}`}>
                                {prod.codigo_interno}
                              </span>
                              <span className="text-xs font-semibold">
                                Stock: {prod.stock_total !== undefined ? fmtKg(prod.stock_total) : "N/D"}
                              </span>
                            </div>
                            <h4 className="font-bold text-sm mt-2 line-clamp-1">{prod.nombre}</h4>
                          </div>
                          <div className="flex justify-between items-baseline mt-2">
                            <span className={`text-[10px] font-medium ${seleccionado ? "text-blue-100" : "text-slate-400"}`}>Precio / Kg</span>
                            <span className="font-mono text-base font-black">${fmt(prod.precio_1_detalle)}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>

        </div>

        {/* RIGHT COLUMN: DEPARTMENT SELECTOR & CATALOG / HISTORY GRID */}
        <div className="lg:col-span-2 space-y-6">
```

Nota: es el mismo JSX que hoy tiene el catálogo, con dos cambios: la grilla de productos pasa de `grid-cols-1 md:grid-cols-2` a **`grid-cols-1`** (una sola columna, porque ahora el contenedor es angosto), y la `<section>` pierde `xl:col-span-2` (ya no vive dentro de ningún grid).

- [ ] **Step 2: Quitar el Catálogo de su posición original y des-anidar "Historial Cliente" del grid `xl:grid-cols-3`**

`old_string`:
```
          {/* DYNAMIC SHARING LAYOUT: CATALOG (2/3 width) AND PURCHASE HISTORY (1/3 width) */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            
            {/* PRODUCT LISTING CARD (2/3 width) */}
            <section className="xl:col-span-2 bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4 min-h-[400px] flex flex-col">
              {!cliente ? (
                <div className="flex-grow flex flex-col items-center justify-center text-center p-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <span className="text-5xl mb-3">👤</span>
                  <h4 className="font-bold text-slate-700">Identifique un Cliente</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs">
                    Busque o registre un cliente en la sección de la izquierda para desplegar el catálogo de productos y realizar pesajes.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between border-b border-slate-50 pb-3">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">📦 Catálogo del Departamento</h3>
                      <p className="text-xs text-slate-400 mt-0.5">Seleccione el producto pesado en la balanza</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1 rounded-full">
                        {productos.length} Productos
                      </span>
                      <button
                        type="button"
                        onClick={() => setMostrarAltaRapida(true)}
                        className="bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-100 hover:border-emerald-600 text-xs font-bold px-3 py-1 rounded-full transition-all"
                      >
                        + Agregar producto
                      </button>
                    </div>
                  </div>

                  {errorText && <p className="text-sm font-semibold text-rose-600 bg-rose-50 p-3 rounded-2xl">{errorText}</p>}

                  {loadingProds ? (
                    <div className="flex-1 flex items-center justify-center">
                      <span className="text-slate-400 font-medium animate-pulse">Cargando productos de la estación...</span>
                    </div>
                  ) : productos.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      <span className="text-4xl">📭</span>
                      <h4 className="font-bold text-slate-700 mt-3">No hay productos cargados</h4>
                      <p className="text-xs text-slate-400 mt-1 max-w-sm">
                        Debe agregar productos con la línea o departamento "{deptActivo}" en el módulo de Ingreso de Datos, o crear uno rápido aquí mismo.
                      </p>
                      <button
                        type="button"
                        onClick={() => setMostrarAltaRapida(true)}
                        className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all"
                      >
                        + Agregar producto a "{deptActivo}"
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {productos.map((prod) => {
                        const seleccionado = productoSel?.id === prod.id;
                        return (
                          <button
                            key={prod.id}
                            type="button"
                            onClick={() => setProductoSel(prod)}
                            className={`p-4 rounded-2xl text-left border transition-all flex flex-col justify-between h-32 ${
                              seleccionado
                                ? "bg-blue-600 text-white border-blue-600 shadow-md scale-[1.02]"
                                : "bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200 hover:border-slate-300"
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between gap-2">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${seleccionado ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"}`}>
                                  {prod.codigo_interno}
                                </span>
                                <span className="text-xs font-semibold">
                                  Stock: {prod.stock_total !== undefined ? fmtKg(prod.stock_total) : "N/D"}
                                </span>
                              </div>
                              <h4 className="font-bold text-sm mt-2 line-clamp-1">{prod.nombre}</h4>
                            </div>
                            <div className="flex justify-between items-baseline mt-2">
                              <span className={`text-[10px] font-medium ${seleccionado ? "text-blue-100" : "text-slate-400"}`}>Precio / Kg</span>
                              <span className="font-mono text-base font-black">${fmt(prod.precio_1_detalle)}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </section>

            {/* DYNAMIC CLIENT PURCHASE HISTORY CARD (1/3 width) */}
            <section className="xl:col-span-1 bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col min-h-[400px] hover:shadow-md transition-all duration-300">
```

`new_string`:
```
          <section className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col min-h-[400px] hover:shadow-md transition-all duration-300">
```

- [ ] **Step 3: Quitar el `</div>` de cierre del grid `xl:grid-cols-3` que ya no existe**

`old_string`:
```
              )}
            </section>

          </div>

        </div>

      </div>
```

`new_string`:
```
              )}
            </section>

        </div>

      </div>
```

- [ ] **Step 4: Verificar build**

Run: `cd frontend && npm run build`
Expected: termina sin errores (`tsc -b` no reporta errores de tipos ni JSX sin cerrar).

- [ ] **Step 5: Verificación manual rápida**

Con `npm run dev` (desde `frontend/`), entrar a Balanza logueado como carnicero/verdulero/charcutero/propietario:
- Sin cliente identificado: la columna izquierda muestra Identificar Cliente → Balanza → Catálogo con placeholder "Identifique un Cliente".
- Con cliente identificado: el catálogo aparece debajo de la balanza en una sola columna, y seleccionar un producto sigue permitiendo pesar y guardar el pesaje igual que antes.
- La columna derecha ya no tiene el catálogo; "Historial Cliente" ahora ocupa todo el ancho de la columna derecha (esto se ve raro todavía — se termina de acomodar en la Task 3, es un estado intermedio esperado).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ModuloBalanza.tsx
git commit -m "$(cat <<'EOF'
refactor: mover Catálogo del Departamento a la columna izquierda en Balanza

Libera la columna derecha para agrandar el panel del ticket en curso
(siguiente tarea). El catálogo pasa a una grilla de una sola columna,
acorde al ancho más angosto de la columna izquierda.
EOF
)"
```

---

### Task 2: Convertir "Pedidos Pendientes en Balanza" en la barra de píldoras "Tickets Activos"

**Files:**
- Modify: `frontend/src/components/ModuloBalanza.tsx`

**Interfaces:**
- Consumes: `pendientesPorCliente` (ya existe, sin cambios), `cargandoPendientes`, `cliente`, `atenderCliente`, `fmt`.
- Produces: una `<section>` con la barra de píldoras horizontal, en la **misma posición** que ocupaba la sección anterior (entre "Selección de Departamento" y "Historial Cliente"). La Task 3 la reubicará dentro del panel grande.

- [ ] **Step 1: Reemplazar la grilla de tarjetas por una barra de píldoras horizontal**

`old_string`:
```
          {/* PEDIDOS PENDIENTES EN BALANZA: SIEMPRE VISIBLE, INDEPENDIENTE DEL CLIENTE IDENTIFICADO */}
          <section className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">🎟️ Pedidos Pendientes en Balanza</h3>
                <p className="text-xs text-slate-400 mt-0.5">Todos los clientes con pesajes sin cobrar · se cancelan desde Caja</p>
              </div>
              <span className="bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1 rounded-full">
                {pendientesPorCliente.length} cliente(s)
              </span>
            </div>

            {cargandoPendientes && pendientesPorCliente.length === 0 ? (
              <p className="text-xs text-slate-400 font-medium animate-pulse py-3">Cargando pedidos pendientes...</p>
            ) : pendientesPorCliente.length === 0 ? (
              <p className="text-xs text-slate-400 font-medium py-3">Ningún cliente tiene pesajes pendientes en este momento.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto pr-1">
                {pendientesPorCliente.map((p) => {
                  const esActivo = cliente?.id === p.cliente_id;
                  return (
                    <button
                      key={p.cliente_id}
                      type="button"
                      onClick={() => atenderCliente(p.cliente_id)}
                      className={`text-left p-3 rounded-2xl border transition-all ${
                        esActivo ? "bg-blue-50 border-blue-200" : "bg-slate-50 hover:bg-slate-100 border-slate-200"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-800 text-xs line-clamp-1">{p.cliente_nombre}</span>
                        {esActivo && <span className="text-[9px] font-bold bg-blue-600 text-white px-1.5 py-0.5 rounded-full shrink-0">Activo</span>}
                      </div>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[10px] text-slate-400 font-mono">{p.cantidad_tickets} ticket(s)</span>
                        <span className="font-mono font-bold text-blue-600 text-sm">${fmt(p.monto_total)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
```

`new_string`:
```
          {/* TICKETS ACTIVOS: SIEMPRE VISIBLE, INDEPENDIENTE DEL CLIENTE IDENTIFICADO. Barra de píldoras
              para saltar de un cliente a otro sin perder ningún ticket pendiente (varios empleados
              atienden distintos clientes desde la misma estación). */}
          <section className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">🎟️ Tickets Activos</h3>
                <p className="text-xs text-slate-400 mt-0.5">Clientes con pesajes sin cobrar · click para cambiar de cliente</p>
              </div>
              <span className="bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1 rounded-full">
                {pendientesPorCliente.length} cliente(s)
              </span>
            </div>

            {cargandoPendientes && pendientesPorCliente.length === 0 ? (
              <p className="text-xs text-slate-400 font-medium animate-pulse py-3">Cargando pedidos pendientes...</p>
            ) : pendientesPorCliente.length === 0 ? (
              <p className="text-xs text-slate-400 font-medium py-3">Ningún cliente tiene pesajes pendientes en este momento.</p>
            ) : (
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {pendientesPorCliente.map((p) => {
                  const esActivo = cliente?.id === p.cliente_id;
                  return (
                    <button
                      key={p.cliente_id}
                      type="button"
                      onClick={() => atenderCliente(p.cliente_id)}
                      className={`shrink-0 flex items-center gap-2 pl-3.5 pr-3 py-2 rounded-full border transition-all whitespace-nowrap ${
                        esActivo ? "bg-blue-600 border-blue-600 text-white shadow-md" : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
                      }`}
                    >
                      <span className="font-bold text-xs">{p.cliente_nombre}</span>
                      <span className={`text-[10px] font-mono ${esActivo ? "text-blue-100" : "text-slate-400"}`}>{p.cantidad_tickets} tk</span>
                      <span className={`font-mono font-bold text-sm ${esActivo ? "text-white" : "text-blue-600"}`}>${fmt(p.monto_total)}</span>
                      {esActivo && <span className="text-[9px] font-bold bg-white/20 px-1.5 py-0.5 rounded-full">Activo</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
```

- [ ] **Step 2: Verificar build**

Run: `cd frontend && npm run build`
Expected: sin errores.

- [ ] **Step 3: Verificación manual rápida**

Con 2+ clientes con pesajes pendientes (crear pesajes de prueba si hace falta): confirmar que la barra de píldoras muestra un elemento por cliente, la píldora del cliente activo se resalta en azul con badge "Activo", y hacer click en otra píldora cambia el cliente identificado (mismo comportamiento que antes, ahora con otro estilo).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ModuloBalanza.tsx
git commit -m "$(cat <<'EOF'
refactor: convertir Pedidos Pendientes en Balanza en barra de píldoras

"Tickets Activos" reemplaza la grilla de tarjetas por una fila horizontal
de píldoras — más compacto, deja espacio para fusionarlo con el panel de
Visita Actual en la siguiente tarea.
EOF
)"
```

---

### Task 3: Fusionar "Tickets Activos" con "Visita Actual" + "Historial de Compras" en un solo panel grande

**Files:**
- Modify: `frontend/src/components/ModuloBalanza.tsx`

**Interfaces:**
- Consumes: todo lo de la Task 2 (barra de píldoras) más el estado ya existente de "Historial Cliente" (`ticketsAgrupados`, `masterProductos`, `actualizarPesoGrupo`, `cancelarGrupoPendiente`, `setPrintedTicket`, `tasaBcv`, `deptActivo`, `historialCompras`, `limiteHistorial`, `setLimiteHistorial`, `cargandoHistorial`, `openSurveyModal`).
- Produces: un único `<section>` de ancho completo en la columna derecha — la barra de píldoras arriba (siempre visible), y debajo, según haya o no cliente identificado, el placeholder "Sin Cliente" grande o el ticket en curso + historial de compras (ambos en grilla de 2 columnas).

- [ ] **Step 1: Eliminar la sección "Tickets Activos" independiente y fusionar su contenido como encabezado del panel grande**

`old_string`:
```
          {/* TICKETS ACTIVOS: SIEMPRE VISIBLE, INDEPENDIENTE DEL CLIENTE IDENTIFICADO. Barra de píldoras
              para saltar de un cliente a otro sin perder ningún ticket pendiente (varios empleados
              atienden distintos clientes desde la misma estación). */}
          <section className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">🎟️ Tickets Activos</h3>
                <p className="text-xs text-slate-400 mt-0.5">Clientes con pesajes sin cobrar · click para cambiar de cliente</p>
              </div>
              <span className="bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1 rounded-full">
                {pendientesPorCliente.length} cliente(s)
              </span>
            </div>

            {cargandoPendientes && pendientesPorCliente.length === 0 ? (
              <p className="text-xs text-slate-400 font-medium animate-pulse py-3">Cargando pedidos pendientes...</p>
            ) : pendientesPorCliente.length === 0 ? (
              <p className="text-xs text-slate-400 font-medium py-3">Ningún cliente tiene pesajes pendientes en este momento.</p>
            ) : (
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {pendientesPorCliente.map((p) => {
                  const esActivo = cliente?.id === p.cliente_id;
                  return (
                    <button
                      key={p.cliente_id}
                      type="button"
                      onClick={() => atenderCliente(p.cliente_id)}
                      className={`shrink-0 flex items-center gap-2 pl-3.5 pr-3 py-2 rounded-full border transition-all whitespace-nowrap ${
                        esActivo ? "bg-blue-600 border-blue-600 text-white shadow-md" : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
                      }`}
                    >
                      <span className="font-bold text-xs">{p.cliente_nombre}</span>
                      <span className={`text-[10px] font-mono ${esActivo ? "text-blue-100" : "text-slate-400"}`}>{p.cantidad_tickets} tk</span>
                      <span className={`font-mono font-bold text-sm ${esActivo ? "text-white" : "text-blue-600"}`}>${fmt(p.monto_total)}</span>
                      {esActivo && <span className="text-[9px] font-bold bg-white/20 px-1.5 py-0.5 rounded-full">Activo</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col min-h-[400px] hover:shadow-md transition-all duration-300">
              <div className="border-b border-slate-50 pb-3">
                <h3 className="text-lg font-bold text-slate-900">📜 Historial Cliente</h3>
                <p className="text-xs text-slate-400 mt-0.5">Sugerencias y hábitos de consumo</p>
              </div>

              {!cliente ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200 mt-4">
                  <span className="text-3xl">👤</span>
                  <h4 className="font-bold text-slate-700 mt-2 text-sm">Sin Cliente</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-[160px]">
                    Busque un cliente en la sección izquierda para visualizar sus compras previas y sugerir ofertas.
                  </p>
                </div>
              ) : (
```

`new_string`:
```
          {/* TICKETS ACTIVOS + VISITA ACTUAL + HISTORIAL: panel grande y único, ancho completo de la
              columna derecha. La barra de píldoras arriba siempre está visible (aunque no haya cliente
              identificado) para poder retomar a cualquier cliente con pesajes pendientes sin pedirle la
              cédula de nuevo — así 4-5 empleados pueden ir y venir entre distintos clientes en paralelo. */}
          <section className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col min-h-[400px] hover:shadow-md transition-all duration-300">
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">🎟️ Tickets Activos</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Clientes con pesajes sin cobrar · click para cambiar de cliente</p>
                  </div>
                  <span className="bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1 rounded-full">
                    {pendientesPorCliente.length} cliente(s)
                  </span>
                </div>

                {cargandoPendientes && pendientesPorCliente.length === 0 ? (
                  <p className="text-xs text-slate-400 font-medium animate-pulse py-3">Cargando pedidos pendientes...</p>
                ) : pendientesPorCliente.length === 0 ? (
                  <p className="text-xs text-slate-400 font-medium py-3">Ningún cliente tiene pesajes pendientes en este momento.</p>
                ) : (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-2">
                    {pendientesPorCliente.map((p) => {
                      const esActivo = cliente?.id === p.cliente_id;
                      return (
                        <button
                          key={p.cliente_id}
                          type="button"
                          onClick={() => atenderCliente(p.cliente_id)}
                          className={`shrink-0 flex items-center gap-2 pl-3.5 pr-3 py-2 rounded-full border transition-all whitespace-nowrap ${
                            esActivo ? "bg-blue-600 border-blue-600 text-white shadow-md" : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
                          }`}
                        >
                          <span className="font-bold text-xs">{p.cliente_nombre}</span>
                          <span className={`text-[10px] font-mono ${esActivo ? "text-blue-100" : "text-slate-400"}`}>{p.cantidad_tickets} tk</span>
                          <span className={`font-mono font-bold text-sm ${esActivo ? "text-white" : "text-blue-600"}`}>${fmt(p.monto_total)}</span>
                          {esActivo && <span className="text-[9px] font-bold bg-white/20 px-1.5 py-0.5 rounded-full">Activo</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {!cliente ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200 mt-4">
                  <span className="text-5xl">👤</span>
                  <h4 className="font-bold text-slate-700 mt-3 text-base">Sin Cliente</h4>
                  <p className="text-sm text-slate-400 mt-1 max-w-xs">
                    Busque un cliente en la sección izquierda, o elija uno de los tickets activos arriba, para ver su visita actual y su historial de compras.
                  </p>
                </div>
              ) : (
```

- [ ] **Step 2: Separar visualmente la barra de píldoras del contenido del ticket con un borde superior**

`old_string`:
```
                <div className="flex-1 flex flex-col justify-between mt-4">
```

`new_string`:
```
                <div className="flex-1 flex flex-col justify-between mt-4 pt-4 border-t border-slate-100">
```

- [ ] **Step 3: Ampliar "Visita Actual" a grilla de 2 columnas**

`old_string`:
```
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                          {ticketsAgrupados.map((grupo) => {
```

`new_string`:
```
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[28rem] overflow-y-auto pr-1">
                          {ticketsAgrupados.map((grupo) => {
```

- [ ] **Step 4: Ampliar "Historial (Últimas Compras)" a grilla de 2 columnas**

`old_string`:
```
                      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                        {historialCompras.slice(0, limiteHistorial).map((ticket) => {
```

`new_string`:
```
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[28rem] overflow-y-auto pr-1">
                        {historialCompras.slice(0, limiteHistorial).map((ticket) => {
```

- [ ] **Step 5: Verificar build**

Run: `cd frontend && npm run build`
Expected: sin errores de TypeScript ni JSX.

- [ ] **Step 6: Verificación manual completa**

Con `npm run dev`, repetir el recorrido completo:
- Sin cliente: el panel derecho muestra la barra de píldoras (si hay clientes con pendientes) y debajo el placeholder grande "Sin Cliente".
- Click en una píldora: identifica a ese cliente y el panel muestra su "Visita Actual" con los tickets en 2 columnas, más su historial de compras debajo, también en 2 columnas.
- Ajustar peso con los botones `+`/`−` o el input directo de un ticket agrupado sigue actualizando el monto correctamente.
- Anular un ticket (ícono de papelera) lo remueve de la lista y de la barra de píldoras si era el último del cliente.
- El botón de imprimir/ver comprobante de un ticket sigue abriendo el modal de ticket impreso.
- "Ver más +" en el historial de compras sigue expandiendo la lista.
- El botón "💬 Encuesta" de una compra pasada sigue abriendo el modal de encuesta de calidad.
- Cambiar de departamento (tabs de "Selección de Departamento") sigue filtrando el catálogo (columna izquierda) correctamente, y las solicitudes de desposte pendientes / el flujo de "Desposte" no se vieron afectados por este cambio.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ModuloBalanza.tsx
git commit -m "$(cat <<'EOF'
feat: fusionar Tickets Activos con Visita Actual en un panel grande

El panel de ticket en curso pasa a ocupar el ancho completo de la columna
derecha (donde antes vivía el catálogo), con la barra de píldoras de
clientes activos como encabezado siempre visible. Cierra el rediseño de
docs/superpowers/specs/2026-08-23-balanza-ticket-grande-multicliente-design.md.
EOF
)"
```

---

### Task 4: Verificación final end-to-end

**Files:** ninguno (solo verificación).

**Interfaces:** N/A.

- [ ] **Step 1: Build limpio**

Run: `cd frontend && npm run build`
Expected: 0 errores, 0 warnings de TypeScript.

- [ ] **Step 2: Lint**

Run: `cd frontend && npm run lint`
Expected: sin errores nuevos introducidos en `ModuloBalanza.tsx` (si ya existían warnings previos de ESLint en otros archivos, no son responsabilidad de este cambio).

- [ ] **Step 3: Recorrido manual multi-cliente en `npm run dev`**

Simular el escenario real que motivó el rediseño:
1. Identificar al Cliente A, pesar un producto → aparece en "Tickets Activos" y en "Visita Actual".
2. Sin cerrar sesión, identificar al Cliente B (buscar por cédula) y pesarle otro producto.
3. Click en la píldora del Cliente A: el panel debe mostrar el ticket de A (no el de B).
4. Click en la píldora del Cliente B: el panel debe mostrar el ticket de B.
5. Confirmar que ambos tickets siguen existiendo en paralelo (ninguno se pierde al saltar entre ellos) — esto ya lo garantiza `pendientesGlobales`/`atenderCliente`, que no se tocaron; el objetivo de este paso es confirmar que el nuevo layout no rompió ese comportamiento.

- [ ] **Step 4: Confirmar que no quedan cambios sin commitear**

Run: `git status`
Expected: `frontend/src/components/ModuloBalanza.tsx` sin cambios pendientes (todo ya commiteado en las Tasks 1-3).
