import { useState, useEffect } from "react";
import apiClient from "../api/client";



interface ItemBorrador {
    id: string;
    nombre: string;
    proveedor: string;
    stock_actual: number;
    ventas_mensuales: number;
    costo_anterior: number;
    costo_actual: number;
    fecha_vencimiento: string;
    cantidadManual: number;
    cantidadSugerida?: number;
    motivoBot?: string;
    severidadBot?: "success" | "warning" | "danger" | "info";
    estadoRevision: "Pendiente" | "AceptadoIA" | "ForzadoManual";
}

interface OrdenAgente {
    id: string;
    proveedor: string;
    fecha: string;
    items_count: number;
    total_usd: number;
    origen: string;
    estatus: "Pendiente" | "Recibido";
}

interface ProveedorApi { id: number; nombre: string; rif: string; }
interface ProductoApi { id: number; nombre: string; proveedor: string | null; stock_total: number; costo_usd: number | null; }

// Widget inline para crear proveedor rápido
function QuickAddProveedorPedidos({ onCreado }: { onCreado: (p: ProveedorApi) => void }) {
    const [open, setOpen] = useState(false);
    const [nombre, setNombre] = useState("");
    const [rif, setRif] = useState("");
    const [err, setErr] = useState("");

    async function guardar() {
        setErr("");
        if (!nombre.trim()) { setErr("Nombre obligatorio."); return; }
        try {
            const res = await apiClient.post<ProveedorApi>("/api/v1/proveedores", { nombre: nombre.trim(), rif: rif.trim() || "S/R" });
            onCreado(res.data);
            setNombre(""); setRif(""); setOpen(false);
        } catch (ex: any) {
            setErr(ex.response?.data?.detail ?? "Error al crear.");
        }
    }

    if (!open) return (
        <button type="button" onClick={() => setOpen(true)} className="mt-1 text-xs text-blue-600 hover:underline font-semibold">
            + Crear proveedor rápido
        </button>
    );
    return (
        <div className="mt-2 p-3 bg-blue-50 border border-blue-100 rounded-xl space-y-2">
            <p className="text-xs font-bold text-blue-700">Nuevo Proveedor</p>
            {err && <p className="text-xs text-rose-600">{err}</p>}
            <input className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre *" />
            <input className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" value={rif} onChange={(e) => setRif(e.target.value)} placeholder="RIF (opcional)" />
            <div className="flex gap-2">
                <button type="button" onClick={() => setOpen(false)} className="flex-1 text-xs bg-white border border-slate-200 rounded-lg py-1.5 font-semibold">Cancelar</button>
                <button type="button" onClick={guardar} className="flex-1 text-xs bg-blue-600 text-white rounded-lg py-1.5 font-semibold">Guardar</button>
            </div>
        </div>
    );
}

const fmt = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ModuloPedidos() {
    const [tab, setTab] = useState<"opcion1_proveedor" | "ordenes">("opcion1_proveedor");
    const [ordenes, setOrdenes] = useState<OrdenAgente[]>([]);

    const [proveedoresApi, setProveedoresApi] = useState<ProveedorApi[]>([]);
    const [productosApi, setProductosApi] = useState<ProductoApi[]>([]);
    const [provSeleccionado, setProvSeleccionado] = useState("");
    const [coberturaSeleccionada, setCoberturaSeleccionada] = useState<string>("30");
    const [diasPersonalizados, setDiasPersonalizados] = useState<string>("45");
    const [msg, setMsg] = useState<string | null>(null);

    const [borradorItems, setBorradorItems] = useState<ItemBorrador[]>([]);
    const [botAnalizado, setBotAnalizado] = useState(false);

    function cargarOrdenes() {
        apiClient.get<any[]>("/api/v1/pedidos/ordenes")
            .then((res) => {
                const list = res.data.map((o: any) => ({
                    id: `OC-MKT0${o.id}`,
                    proveedor: o.proveedor,
                    fecha: o.created_at.slice(0, 10),
                    items_count: o.items_count,
                    total_usd: o.total_usd,
                    origen: o.origen,
                    estatus: o.estatus as "Pendiente" | "Recibido"
                }));
                setOrdenes(list);
            })
            .catch(() => {});
    }

    function cargarProveedoresYProductos() {
        apiClient.get<ProveedorApi[]>("/api/v1/proveedores").then((res) => {
            setProveedoresApi(res.data);
            if (res.data.length > 0 && !provSeleccionado) setProvSeleccionado(res.data[0].nombre);
        }).catch(() => {});
        apiClient.get<ProductoApi[]>("/api/v1/productos").then((res) => setProductosApi(res.data)).catch(() => {});
    }

    useEffect(() => {
        cargarOrdenes();
        cargarProveedoresYProductos();
    }, []);

    useEffect(() => {
        // Productos que tienen este proveedor registrado, o todos si no hay filtro
        const productosFiltrados = provSeleccionado
            ? productosApi.filter(p => p.proveedor === provSeleccionado)
            : [];
        const itemsIniciales: ItemBorrador[] = productosFiltrados.map(p => ({
            id: String(p.id),
            nombre: p.nombre,
            proveedor: p.proveedor ?? provSeleccionado,
            stock_actual: p.stock_total ?? 0,
            ventas_mensuales: 0,
            costo_anterior: 0,
            costo_actual: Number(p.costo_usd ?? 0),
            fecha_vencimiento: "",
            cantidadManual: 0,
            estadoRevision: "Pendiente" as const,
        }));
        setBorradorItems(itemsIniciales);
        setBotAnalizado(false);
    }, [provSeleccionado, productosApi]);

    function getDiasEfectivos(): number {
        return coberturaSeleccionada === "custom" ? Number(diasPersonalizados || 0) : Number(coberturaSeleccionada);
    }

    function diasParaVencer(fv: string) {
        if (!fv) return 999;
        const t = new Date(`${fv}T00:00:00`).getTime() - new Date().getTime();
        return Math.ceil(t / 86400000);
    }

    function agregarProductoNuevo() {
        const nuevoItem: ItemBorrador = {
            id: `NEW-${Math.floor(Math.random() * 1000)}`,
            nombre: "Nuevo Producto / Lanzamiento",
            proveedor: provSeleccionado,
            stock_actual: 0,
            ventas_mensuales: 0,
            costo_anterior: 0,
            costo_actual: 1.00,
            fecha_vencimiento: "",
            cantidadManual: 0,
            estadoRevision: "Pendiente"
        };
        setBorradorItems([...borradorItems, nuevoItem]);
    }

    function actualizarCantidadManual(id: string, cant: number) {
        setBorradorItems(borradorItems.map(item =>
            item.id === id ? { ...item, cantidadManual: cant, estadoRevision: "ForzadoManual" } : item
        ));
    }

    function actualizarCostoActual(id: string, costo: number) {
        setBorradorItems(borradorItems.map(item =>
            item.id === id ? { ...item, costo_actual: costo } : item
        ));
    }

    function actualizarNombreNuevo(id: string, nombre: string) {
        setBorradorItems(borradorItems.map(item =>
            item.id === id ? { ...item, nombre } : item
        ));
    }

    function analizarBorradorConBot() {
        const dias = getDiasEfectivos();

        const itemsCorregidos = borradorItems.map((item) => {
            const ventaDiaria = item.ventas_mensuales / 30;
            const stockMeta = ventaDiaria * dias;
            const diasVencimiento = diasParaVencer(item.fecha_vencimiento);

            let sugerida = 0;
            let motivo = "Tu cantidad propuesta coincide con los rangos seguros de stock.";
            let severidad: "success" | "warning" | "danger" | "info" = "success";

            if (item.fecha_vencimiento && diasVencimiento <= 15 && diasVencimiento > 0) {
                sugerida = 0;
                motivo = `⛔ EL BOT CORRIGE A 0: Lote en anaquel vence en ${diasVencimiento} días. Riesgo de pérdida. No compres más hasta vaciar estantes.`;
                severidad = "danger";
            }
            else if (item.stock_actual < stockMeta) {
                sugerida = Math.ceil(stockMeta - item.stock_actual);
                motivo = `🤖 IA CORRIGE: Para cubrir ${dias} días necesitas comprar +${sugerida} u. según velocidad de ventas mensual.`;
                severidad = "warning";

                if (item.costo_actual > item.costo_anterior && item.costo_anterior > 0) {
                    const extra = Math.ceil(sugerida * 0.20);
                    sugerida += extra;
                    motivo += ` Incluye +20% de protección contra inflación detectada.`;
                }
            }
            else if (item.costo_anterior > 0 && item.costo_actual < item.costo_anterior) {
                sugerida = Math.ceil(ventaDiaria * 15);
                motivo = `💎 IA SUGIERE AUMENTAR: Costo bajó. Aprovecha descuento mayorista para mejorar margen de ganancia.`;
                severidad = "info";
            }

            return {
                ...item,
                cantidadSugerida: sugerida,
                motivoBot: motivo,
                severidadBot: severidad,
                estadoRevision: sugerida !== item.cantidadManual ? ("Pendiente" as const) : ("ForzadoManual" as const)
            };
        });

        setBorradorItems(itemsCorregidos);
        setBotAnalizado(true);
    }

    function aplicarDecisionRenglon(id: string, accion: "aceptar" | "ignorar") {
        setBorradorItems(borradorItems.map(item => {
            if (item.id === id) {
                return {
                    ...item,
                    cantidadManual: accion === "aceptar" ? (item.cantidadSugerida ?? item.cantidadManual) : item.cantidadManual,
                    estadoRevision: accion === "aceptar" ? "AceptadoIA" : "ForzadoManual"
                };
            }
            return item;
        }));
    }

    async function procesarOrdenDefinitiva() {
        const itemsFinales = borradorItems.filter(p => p.cantidadManual > 0);
        if (itemsFinales.length === 0) {
            setMsg("El borrador no contiene cantidades para procesar la orden.");
            return;
        }

        const payloadItems = itemsFinales.map(item => ({
            nombre: item.nombre,
            cantidad: item.cantidadManual,
            costo: item.costo_actual
        }));

        try {
            const res = await apiClient.post("/api/v1/pedidos/guardar-auditado", {
                proveedor: provSeleccionado,
                items: payloadItems
            });
            setMsg(`¡Éxito! Orden de Compra registrada con código OC-MKT0${res.data.id} bajo tus parámetros manuales.`);
            cargarOrdenes();
            setTab("ordenes");
            setBotAnalizado(false);
            setTimeout(() => setMsg(null), 4000);
        } catch (e) {
            setMsg("Ocurrió un error al guardar la orden en el servidor.");
        }
    }

    return (
        <div className="p-6 space-y-6">
            <div className="rounded-3xl bg-slate-900 p-8 text-white border border-slate-800 shadow-xl">
                <h2 className="text-3xl font-black tracking-tight">Pedidos & Planeación Comercial</h2>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-1">Ecosistema Predictivo Multi-Modal de Abastecimiento</p>

                <div className="mt-6 flex flex-wrap gap-2 bg-slate-800 p-1 rounded-2xl w-fit border border-slate-700">
                    <button type="button" onClick={() => setTab("opcion1_proveedor")} className={`rounded-xl px-4 py-2 text-sm font-bold transition-all duration-300 ${tab === "opcion1_proveedor" ? "bg-blue-600 text-white shadow-md" : "text-slate-400 hover:text-white"}`}>🏬 Opción 1: Recibir Proveedor</button>
                    <button type="button" onClick={() => setTab("ordenes")} className={`rounded-xl px-4 py-2 text-sm font-bold transition-all duration-300 ${tab === "ordenes" ? "bg-blue-600 text-white shadow-md" : "text-slate-400 hover:text-white"}`}>📋 Órdenes Emitidas ({ordenes.length})</button>
                </div>
            </div>

            {msg && <div className="p-4 rounded-xl text-sm font-bold border bg-emerald-50 border-emerald-100 text-emerald-700">{msg}</div>}

            {tab === "opcion1_proveedor" && (
                <div className="space-y-6">
                    <div className="rounded-3xl bg-white p-6 border border-slate-100 shadow-sm grid grid-cols-4 gap-4 items-end">
                        <div className="flex flex-col">
                            <label className="flex flex-col">
                                <span className="text-xs font-black uppercase tracking-wider text-slate-400 mb-1">1. Seleccionar Proveedor</span>
                                <select value={provSeleccionado} onChange={(e) => setProvSeleccionado(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
                                    <option value="">— Seleccionar —</option>
                                    {proveedoresApi.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                                </select>
                            </label>
                            <QuickAddProveedorPedidos onCreado={(p) => {
                                setProveedoresApi(prev => [...prev, p]);
                                setProvSeleccionado(p.nombre);
                            }} />
                        </div>
                        <label className="flex flex-col">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-400 mb-1">2. Tiempo de Cobertura</span>
                            <select value={coberturaSeleccionada} onChange={(e) => setCoberturaSeleccionada(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="7">Abastecer 7 Días (1 Semana)</option>
                                <option value="15">Abastecer 15 Días (Quincena)</option>
                                <option value="30">Abastecer 30 Días (1 Mes Completo)</option>
                                <option value="60">Abastecer 60 Días (Bimestre)</option>
                                <option value="custom">Otro (Días personalizados)...</option>
                            </select>
                        </label>

                        {coberturaSeleccionada === "custom" ? (
                            <label className="flex flex-col animate-fade-in">
                                <span className="text-xs font-black uppercase tracking-wider text-amber-600 mb-1">Días Personalizados</span>
                                <input type="number" min="1" value={diasPersonalizados} onChange={(e) => setDiasPersonalizados(e.target.value)} className="rounded-xl border border-amber-300 px-3 py-2 text-sm font-bold bg-amber-50/50 focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-800" />
                            </label>
                        ) : <div />}

                        <div className="flex gap-2 col-span-1 justify-end">
                            <button type="button" onClick={agregarProductoNuevo} className="rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 px-4 py-2.5 text-xs font-bold border border-slate-200 transition-all">
                                ➕ Lanzamiento / Producto Nuevo
                            </button>
                            <button type="button" onClick={analizarBorradorConBot} className="rounded-2xl bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 text-xs font-black shadow-md transition-all">
                                🤖 Analizar con Bot IA
                            </button>
                        </div>
                    </div>

                    <div className="rounded-3xl bg-white border border-slate-100 shadow-sm overflow-hidden">
                        <div className="p-4 bg-slate-50/60 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">Paso 1: Elaborar Borrador de Pedido de Compra</h3>
                            {botAnalizado && (
                                <button type="button" onClick={procesarOrdenDefinitiva} className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-xs font-bold shadow-md transition-colors">
                                    💾 Confirmar y Cerrar Orden de Compra
                                </button>
                            )}
                        </div>

                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/40 text-left">
                                    <th className="px-6 py-3 text-xs font-bold uppercase text-slate-400">Producto</th>
                                    <th className="px-6 py-3 text-xs font-bold uppercase text-slate-400 text-center">Costo Unitario ($)</th>
                                    <th className="px-6 py-3 text-xs font-bold uppercase text-slate-400 text-center">Tu Pedido (Manual)</th>
                                    {botAnalizado && <th className="px-6 py-3 text-xs font-bold uppercase text-slate-400 text-center">Corrección Bot IA</th>}
                                    {botAnalizado && <th className="px-6 py-3 text-xs font-bold uppercase text-slate-400 text-right">Tu Decisión Fiscal</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-slate-700">
                                {borradorItems.map((item) => (
                                    <tr key={item.id} className={`hover:bg-slate-50/30 transition-colors ${item.estadoRevision === "AceptadoIA" ? "bg-blue-50/20" : item.estadoRevision === "ForzadoManual" ? "bg-amber-50/10" : ""}`}>
                                        <td className="px-6 py-4 max-w-sm">
                                            {item.id.startsWith("NEW-") ? (
                                                <input type="text" value={item.nombre} onChange={(e) => actualizarNombreNuevo(item.id, e.target.value)} className="w-full rounded-lg border border-blue-300 px-2 py-1 text-xs font-bold text-blue-700 focus:outline-none bg-blue-50/30" placeholder="Nombre del nuevo lanzamiento" />
                                            ) : (
                                                <p className="font-bold text-slate-900">{item.nombre}</p>
                                            )}

                                            {botAnalizado && item.motivoBot && (
                                                <p className={`text-[11px] font-semibold mt-1 leading-relaxed ${item.severidadBot === "danger" ? "text-rose-600 font-black animate-pulse" :
                                                    item.severidadBot === "warning" ? "text-amber-600" :
                                                        item.severidadBot === "info" ? "text-blue-600" : "text-slate-400"
                                                    }`}>{item.motivoBot}</p>
                                            )}
                                        </td>

                                        <td className="px-6 py-4 text-center font-mono w-32">
                                            <input type="number" step="0.01" value={item.costo_actual} onChange={(e) => actualizarCostoActual(item.id, Number(e.target.value))} className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-center font-bold text-slate-800 text-xs focus:ring-1 focus:ring-blue-500" />
                                        </td>

                                        <td className="px-6 py-4 text-center w-40">
                                            <div className="flex justify-center items-center gap-1.5">
                                                <input type="number" min="0" value={item.cantidadManual === 0 ? "" : item.cantidadManual} onChange={(e) => actualizarCantidadManual(item.id, Number(e.target.value))} className="w-24 rounded-xl border border-slate-300 px-3 py-1.5 text-center font-mono font-black text-slate-900 text-sm bg-white focus:ring-2 focus:ring-blue-600 shadow-inner" placeholder="0" />
                                                <span className="text-[10px] text-slate-400 font-bold uppercase">unid</span>
                                            </div>
                                        </td>

                                        {botAnalizado && (
                                            <td className="px-6 py-4 text-center font-mono font-bold w-44">
                                                {item.cantidadSugerida !== undefined && item.cantidadSugerida > 0 ? (
                                                    <span className="text-sm font-black text-blue-600 bg-blue-50 border border-blue-100 rounded-xl px-3 py-1.5">
                                                        + {item.cantidadSugerida} u.
                                                    </span>
                                                ) : (
                                                    <span className="text-xs font-bold text-slate-400 bg-slate-100 border border-slate-200 rounded-xl px-2.5 py-1 uppercase tracking-wider">🚫 Bloquear</span>
                                                )}
                                            </td>
                                        )}

                                        {botAnalizado && (
                                            <td className="px-6 py-4 text-right w-64">
                                                <div className="flex justify-end gap-1.5">
                                                    <button type="button" onClick={() => aplicarDecisionRenglon(item.id, "aceptar")} className={`px-2.5 py-1 text-[11px] font-black uppercase rounded-lg transition-all border ${item.estadoRevision === "AceptadoIA"
                                                        ? "bg-blue-600 text-white border-blue-600"
                                                        : "bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border-blue-100"
                                                        }`}>
                                                        Aceptar IA 🤖
                                                    </button>
                                                    <button type="button" onClick={() => aplicarDecisionRenglon(item.id, "ignorar")} className={`px-2.5 py-1 text-[11px] font-black uppercase rounded-lg transition-all border ${item.estadoRevision === "ForzadoManual"
                                                        ? "bg-amber-500 text-white border-amber-500"
                                                        : "bg-amber-50 hover:bg-amber-500 text-amber-700 hover:text-white border-amber-100"
                                                        }`}>
                                                        Caso Omiso ⚖️
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {tab === "ordenes" && (
                <div className="rounded-3xl bg-white border border-slate-100 shadow-sm overflow-hidden animate-fade-in">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50 text-left">
                                <th className="px-6 py-3 text-xs font-bold uppercase text-slate-400">Código OC</th>
                                <th className="px-6 py-3 text-xs font-bold uppercase text-slate-400">Proveedor Mayorista</th>
                                <th className="px-6 py-3 text-xs font-bold uppercase text-slate-400">Fecha Emisión</th>
                                <th className="px-6 py-3 text-xs font-bold uppercase text-slate-400">Renglones</th>
                                <th className="px-6 py-3 text-xs font-bold uppercase text-slate-400">Monto Inversión</th>
                                <th className="px-6 py-3 text-xs font-bold uppercase text-slate-400">Generado Por</th>
                                <th className="px-6 py-3 text-xs font-bold uppercase text-slate-400">Estado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                            {ordenes.map((o) => (
                                <tr key={o.id} className="hover:bg-slate-50/30">
                                    <td className="px-6 py-4 font-mono font-bold text-blue-600">{o.id}</td>
                                    <td className="px-6 py-4 font-semibold text-slate-800">{o.proveedor}</td>
                                    <td className="px-6 py-4 text-slate-500">{o.fecha}</td>
                                    <td className="px-6 py-4 font-mono font-medium text-slate-600">{o.items_count} renglones</td>
                                    <td className="px-6 py-4 font-black text-slate-900">${fmt(o.total_usd)}</td>
                                    <td className="px-6 py-4"><span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600">{o.origen}</span></td>
                                    <td className="px-6 py-4"><span className="rounded-full bg-amber-50 text-amber-700 px-3 py-1 text-xs font-bold border border-amber-100 animate-pulse">{o.estatus}</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}