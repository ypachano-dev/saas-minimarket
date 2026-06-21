import { useEffect, useState, useMemo, type FormEvent } from "react";
import apiClient from "../api/client";
import AgentPanel from "./AgentPanel";

interface Cliente {
  id: number;
  cedula: string;
  nombre: string;
  telefono?: string | null;
  email?: string | null;
  instagram?: string | null;
  telegram?: string | null;
  direccion?: string | null;
  limite_credito: number | string;
}

interface TicketCompra {
  id: number;
  producto_id: number;
  peso: number | string;
  monto_usd: number | string;
  created_at: string;
}

interface CxC {
  id: number;
  monto_total: number | string;
  monto_abonado: number | string;
  saldo: number | string;
  fecha_vencimiento: string;
  status: string;
}

interface Visita {
  id: number;
  fecha_visita: string;
  comentarios: string | null;
  encuesta: { inventario_cliente: string | null; rotacion_productos: string | null; comentarios_adicionales: string | null } | null;
}

interface OrdenVentaItem {
  producto_id: number;
  producto_nombre: string | null;
  cantidad: number | string;
  precio_unitario: number | string;
  monto_usd: number | string;
}

interface OrdenVenta {
  id: number;
  tipo: string;
  total_usd: number | string;
  estatus: string;
  created_at: string;
  items: OrdenVentaItem[];
}

interface Faltante {
  id: number;
  cliente_id: number;
  cliente_nombre: string;
  item: string;
  status: string;
  disponible: boolean;
  created_at: string;
}

interface LogBot {
  id: number;
  ticket_id: number;
  cliente_nombre: string;
  tipo_mensaje: string;
  respuesta_cliente: string | null;
  status_envio: string;
  created_at: string;
}

interface SegmentoCliente {
  cliente_id: number;
  nombre: string;
  telefono: string | null;
  segmento: string;
  dias_ultima_compra: number | null;
  frecuencia_90d: number;
  monto_90d: number | string;
  saldo_cxc: number | string;
  saldo_cxc_vencido: boolean;
  recomendacion: string;
}

interface InteligenciaCRM {
  clientes: SegmentoCliente[];
  resumen_segmentos: Record<string, number>;
  monto_en_riesgo_usd: number | string;
}

interface MensajeCampana {
  cliente_id: number;
  nombre: string;
  telefono: string | null;
  mensaje: string;
}

const badgeEnvio: Record<string, string> = {
  respondido: "bg-emerald-50 text-emerald-700",
  enviado: "bg-blue-50 text-blue-700",
  fallido: "bg-red-50 text-red-700",
};

const SEGMENTOS_INFO: Record<string, { emoji: string; cls: string; orden: number }> = {
  "VIP": { emoji: "👑", cls: "bg-violet-100 text-violet-700 border-violet-200", orden: 0 },
  "En Riesgo": { emoji: "⚠️", cls: "bg-amber-100 text-amber-700 border-amber-200", orden: 1 },
  "Inactivo": { emoji: "💤", cls: "bg-rose-100 text-rose-700 border-rose-200", orden: 2 },
  "Nuevo": { emoji: "✨", cls: "bg-blue-100 text-blue-700 border-blue-200", orden: 3 },
  "Activo": { emoji: "✅", cls: "bg-emerald-100 text-emerald-700 border-emerald-200", orden: 4 },
};

const inputCls = "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const fmt = (n: number | string) => Number(n).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ModuloCRM() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [clienteSel, setClienteSel] = useState<Cliente | null>(null);

  const [tickets, setTickets] = useState<TicketCompra[]>([]);
  const [cxc, setCxc] = useState<CxC[]>([]);
  const [cxcDisponible, setCxcDisponible] = useState(true);
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [ordenes, setOrdenes] = useState<OrdenVenta[]>([]);
  const [faltantesCliente, setFaltantesCliente] = useState<Faltante[]>([]);
  const [logsCliente, setLogsCliente] = useState<LogBot[]>([]);
  const [cargandoFicha, setCargandoFicha] = useState(false);

  const [logsGenerales, setLogsGenerales] = useState<LogBot[]>([]);

  const [itemFaltante, setItemFaltante] = useState("");
  const [notasFaltante, setNotasFaltante] = useState("");
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const [generandoAlo, setGenerandoAlo] = useState<number | null>(null);
  const [aloModal, setAloModal] = useState<{ mensaje: string; telefono: string | null } | null>(null);
  const [copiado, setCopiado] = useState(false);

  // --- Inteligencia CRM: segmentación RFM y campañas masivas con ALO ---
  const [inteligencia, setInteligencia] = useState<InteligenciaCRM | null>(null);
  const [segmentoCampana, setSegmentoCampana] = useState<string | null>(null);
  const [generandoCampana, setGenerandoCampana] = useState(false);
  const [resultadoCampana, setResultadoCampana] = useState<{ segmento: string; fuente: string; mensajes: MensajeCampana[] } | null>(null);
  const [copiadoCampanaId, setCopiadoCampanaId] = useState<number | null>(null);

  const cargarInteligencia = () => {
    apiClient.get<InteligenciaCRM>("/api/v1/crm/inteligencia").then((res) => setInteligencia(res.data)).catch(() => setInteligencia(null));
  };

  useEffect(() => {
    apiClient.get<Cliente[]>("/api/v1/clientes").then((res) => setClientes(res.data)).catch(() => setClientes([]));
    apiClient.get<LogBot[]>("/api/v1/crm/postventa-logs").then((res) => setLogsGenerales(res.data)).catch(() => setLogsGenerales([]));
    cargarInteligencia();
  }, []);

  const segmentoPorCliente = useMemo(() => {
    const mapa = new Map<number, SegmentoCliente>();
    inteligencia?.clientes.forEach((c) => mapa.set(c.cliente_id, c));
    return mapa;
  }, [inteligencia]);

  async function generarCampana(segmento: string) {
    setSegmentoCampana(segmento);
    setGenerandoCampana(true);
    setResultadoCampana(null);
    try {
      const { data } = await apiClient.post<{ segmento: string; fuente: string; total_segmento: number; generados: MensajeCampana[] }>(
        "/api/v1/agentes/alo/campana",
        { segmento, limite: 15 }
      );
      setResultadoCampana({ segmento: data.segmento, fuente: data.fuente, mensajes: data.generados });
    } catch {
      setMsg({ tipo: "error", texto: "ALO no pudo generar la campaña en este momento." });
    } finally {
      setGenerandoCampana(false);
    }
  }

  function copiarMensajeCampana(item: MensajeCampana) {
    navigator.clipboard.writeText(item.mensaje).then(() => {
      setCopiadoCampanaId(item.cliente_id);
      setTimeout(() => setCopiadoCampanaId(null), 2000);
    });
  }

  const clientesFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return clientes;
    return clientes.filter((c) => c.nombre.toLowerCase().includes(termino) || c.cedula.toLowerCase().includes(termino));
  }, [busqueda, clientes]);

  function seleccionarCliente(cliente: Cliente) {
    setClienteSel(cliente);
    setMsg(null);
    setCargandoFicha(true);

    Promise.allSettled([
      apiClient.get<TicketCompra[]>("/api/v1/tickets", { params: { cliente_id: cliente.id, status: "procesado" } }),
      apiClient.get<CxC[]>("/api/v1/cartera/cxc", { params: { cliente_id: cliente.id } }),
      apiClient.get<Visita[]>(`/api/v1/visitas/cliente/${cliente.id}`),
      apiClient.get<OrdenVenta[]>(`/api/v1/ventas/ordenes/cliente/${cliente.id}`),
      apiClient.get<Faltante[]>("/api/v1/crm/faltantes"),
      apiClient.get<LogBot[]>("/api/v1/crm/postventa-logs", { params: { cliente_id: cliente.id } }),
    ]).then(([rTickets, rCxc, rVisitas, rOrdenes, rFaltantes, rLogs]) => {
      setTickets(rTickets.status === "fulfilled" ? rTickets.value.data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) : []);

      if (rCxc.status === "fulfilled") {
        setCxc(rCxc.value.data);
        setCxcDisponible(true);
      } else {
        setCxc([]);
        setCxcDisponible(false); // probablemente 403: el rol actual no gestiona cartera
      }

      setVisitas(rVisitas.status === "fulfilled" ? rVisitas.value.data : []);
      setOrdenes(rOrdenes.status === "fulfilled" ? rOrdenes.value.data : []);
      setFaltantesCliente(
        rFaltantes.status === "fulfilled" ? rFaltantes.value.data.filter((f) => f.cliente_id === cliente.id) : []
      );
      setLogsCliente(rLogs.status === "fulfilled" ? rLogs.value.data : []);
    }).finally(() => setCargandoFicha(false));
  }

  async function registrarFaltante(e: FormEvent) {
    e.preventDefault();
    if (!clienteSel || !itemFaltante.trim()) {
      setMsg({ tipo: "error", texto: "Escribe el producto o sugerencia que pidió el cliente." });
      return;
    }
    const descripcion = notasFaltante.trim() ? `${itemFaltante.trim()} — ${notasFaltante.trim()}` : itemFaltante.trim();
    try {
      const { data } = await apiClient.post<Faltante>("/api/v1/crm/faltantes", { cliente_id: clienteSel.id, item: descripcion });
      setFaltantesCliente((prev) => [data, ...prev]);
      setItemFaltante("");
      setNotasFaltante("");
      setMsg({ tipo: "ok", texto: "Petición registrada en el Libro de Faltantes." });
    } catch {
      setMsg({ tipo: "error", texto: "No se pudo registrar la petición." });
    }
  }

  // ALO redacta un mensaje de WhatsApp puntual para un faltante específico
  async function generarMensajeAlo(f: Faltante) {
    setGenerandoAlo(f.id);
    try {
      const { data } = await apiClient.post<{ respuesta: string }>("/api/v1/agentes/alo", {
        cliente_id: f.cliente_id,
        contexto: f.item,
      });
      setCopiado(false);
      setAloModal({ mensaje: data.respuesta, telefono: clienteSel?.telefono ?? null });
    } catch {
      setMsg({ tipo: "error", texto: "ALO no pudo generar el mensaje en este momento." });
    } finally {
      setGenerandoAlo(null);
    }
  }

  function copiarMensajeAlo() {
    if (!aloModal) return;
    navigator.clipboard.writeText(aloModal.mensaje).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  const diasDesdeUltimaCompra = tickets.length > 0
    ? Math.floor((Date.now() - new Date(tickets[0].created_at).getTime()) / 86400000)
    : null;
  const saldoCxcTotal = cxc.filter((c) => c.status !== "pagada").reduce((acc, c) => acc + Number(c.saldo), 0);
  const segmentoSel = clienteSel ? segmentoPorCliente.get(clienteSel.id) ?? null : null;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <header>
        <h2 className="text-3xl font-black tracking-tight text-slate-900">🤝 Módulo CRM</h2>
        <p className="text-sm text-slate-500 font-medium mt-1">Ficha de cliente 360°, postventa y ventas asistidas por ALO</p>
      </header>

      {msg && (
        <p className={`text-sm font-medium px-4 py-2 rounded-xl ${msg.tipo === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
          {msg.texto}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* LISTA DE CLIENTES */}
        <div className="lg:col-span-1 space-y-3">
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="🔍 Buscar por nombre o cédula..."
            className={inputCls}
          />
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
            {clientesFiltrados.length === 0 ? (
              <p className="text-center text-xs text-slate-400 py-8 px-3">Sin clientes que coincidan.</p>
            ) : (
              clientesFiltrados.map((c) => {
                const activo = clienteSel?.id === c.id;
                const seg = segmentoPorCliente.get(c.id);
                const segInfo = seg ? SEGMENTOS_INFO[seg.segmento] : null;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => seleccionarCliente(c)}
                    className={`w-full text-left p-3.5 transition-all ${activo ? "bg-blue-50" : "hover:bg-slate-50"}`}
                  >
                    <p className={`font-bold text-sm ${activo ? "text-blue-700" : "text-slate-800"}`}>{c.nombre}</p>
                    <p className="text-[11px] text-slate-400 font-mono">{c.cedula}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {segInfo && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${segInfo.cls}`}>
                          {segInfo.emoji} {seg!.segmento}
                        </span>
                      )}
                      {Number(c.limite_credito) > 0 && (
                        <span className="text-[9px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full inline-block">
                          Límite: ${fmt(c.limite_credito)}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* FICHA DEL CLIENTE / VISTA GENERAL */}
        <div className="lg:col-span-3 space-y-6">
          {!clienteSel ? (
            <>
              {/* INTELIGENCIA CRM: segmentación RFM en vivo, sin IA (siempre disponible) */}
              <section className="bg-white rounded-3xl border border-slate-100/80 shadow-sm p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">🧠 Inteligencia CRM</h3>
                    <p className="text-xs text-slate-400">Segmentación automática de tu cartera de clientes, calculada con datos reales.</p>
                  </div>
                  {inteligencia && Number(inteligencia.monto_en_riesgo_usd) > 0 && (
                    <span className="text-xs font-bold bg-rose-50 text-rose-700 border border-rose-100 px-3 py-1.5 rounded-full">
                      ${fmt(inteligencia.monto_en_riesgo_usd)} en riesgo
                    </span>
                  )}
                </div>

                {!inteligencia ? (
                  <p className="text-sm text-slate-400">Calculando segmentos...</p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {Object.entries(SEGMENTOS_INFO).sort((a, b) => a[1].orden - b[1].orden).map(([segmento, info]) => {
                      const count = inteligencia.resumen_segmentos[segmento] ?? 0;
                      return (
                        <div key={segmento} className={`rounded-2xl border p-3.5 text-center ${info.cls}`}>
                          <p className="text-2xl">{info.emoji}</p>
                          <p className="text-2xl font-black">{count}</p>
                          <p className="text-[10px] font-bold uppercase tracking-wide">{segmento}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* CAMPAÑAS MASIVAS CON ALO */}
              <section className="bg-white rounded-3xl border border-slate-100/80 shadow-sm p-6 space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">🚀 Campañas con ALO</h3>
                  <p className="text-xs text-slate-400">Elige un segmento y ALO redacta un mensaje personalizado para cada cliente, listo para enviar por WhatsApp.</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {inteligencia && Object.entries(SEGMENTOS_INFO).sort((a, b) => a[1].orden - b[1].orden).map(([segmento, info]) => {
                    const count = inteligencia.resumen_segmentos[segmento] ?? 0;
                    if (count === 0) return null;
                    const generandoEste = generandoCampana && segmentoCampana === segmento;
                    return (
                      <button
                        key={segmento}
                        type="button"
                        disabled={generandoCampana}
                        onClick={() => generarCampana(segmento)}
                        className={`text-xs font-bold px-3.5 py-2 rounded-xl border transition-all disabled:opacity-50 ${info.cls} hover:shadow-sm`}
                      >
                        {generandoEste ? "ALO está redactando..." : `${info.emoji} Generar para ${count} cliente(s) ${segmento}`}
                      </button>
                    );
                  })}
                </div>

                {resultadoCampana && (
                  <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-4 space-y-2.5 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-violet-800">
                        ✨ {resultadoCampana.mensajes.length} mensaje(s) para el segmento "{resultadoCampana.segmento}"
                        {resultadoCampana.fuente === "ia" ? " · generados por IA" : " · plantilla (configura ANTHROPIC_API_KEY para personalización por IA)"}
                      </p>
                      <button type="button" onClick={() => setResultadoCampana(null)} className="text-xs text-slate-400 hover:text-slate-600 font-semibold">✕ Cerrar</button>
                    </div>
                    {resultadoCampana.mensajes.length === 0 ? (
                      <p className="text-xs text-slate-400">No hay clientes en este segmento.</p>
                    ) : (
                      <div className="space-y-2 max-h-80 overflow-y-auto">
                        {resultadoCampana.mensajes.map((m) => (
                          <div key={m.cliente_id} className="bg-white rounded-2xl border border-violet-100 p-3.5 space-y-2">
                            <p className="text-xs font-bold text-slate-800">{m.nombre}</p>
                            <p className="text-xs text-slate-600 whitespace-pre-wrap">{m.mensaje}</p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => copiarMensajeCampana(m)}
                                className="text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-full transition-all"
                              >
                                {copiadoCampanaId === m.cliente_id ? "✓ Copiado" : "📋 Copiar"}
                              </button>
                              {m.telefono && (
                                <a
                                  href={`https://wa.me/${m.telefono.replace(/\D/g, "")}?text=${encodeURIComponent(m.mensaje)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-full transition-all"
                                >
                                  💬 Enviar por WhatsApp
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* ACTIVIDAD GENERAL DE POSTVENTA */}
              <section className="bg-white rounded-3xl border border-slate-100/80 shadow-sm p-6 space-y-4">
              <h3 className="text-lg font-bold text-slate-900">🤖 Actividad General de Postventa</h3>
              {logsGenerales.length === 0 ? (
                <p className="text-sm text-slate-400">Sin actividad del bot todavía. Selecciona un cliente a la izquierda para ver su ficha completa.</p>
              ) : (
                <ul className="space-y-3">
                  {logsGenerales.map((l) => (
                    <li key={l.id} className="rounded-2xl bg-slate-50 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <p className="text-sm text-slate-700">
                          <span className="font-semibold text-slate-900">WhatsApp → {l.cliente_nombre}:</span> {l.tipo_mensaje}
                        </p>
                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${badgeEnvio[l.status_envio] ?? "bg-slate-100 text-slate-600"}`}>
                          {l.status_envio}
                        </span>
                      </div>
                      {l.respuesta_cliente && (
                        <p className="mt-2 border-l-2 border-emerald-200 pl-3 text-sm text-slate-500">Respondido: {l.respuesta_cliente}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              </section>
            </>
          ) : cargandoFicha ? (
            <p className="text-center text-sm text-slate-400 py-16">Cargando ficha del cliente...</p>
          ) : (
            <>
              {/* CABECERA DE LA FICHA */}
              <section className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-xl font-black text-slate-900">{clienteSel.nombre}</h3>
                      {segmentoSel && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${SEGMENTOS_INFO[segmentoSel.segmento]?.cls ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
                          {SEGMENTOS_INFO[segmentoSel.segmento]?.emoji} {segmentoSel.segmento}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-mono text-slate-400 mt-0.5">{clienteSel.cedula}</p>
                    <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-500">
                      {clienteSel.telefono && <span>📞 {clienteSel.telefono}</span>}
                      {clienteSel.email && <span>✉️ {clienteSel.email}</span>}
                      {clienteSel.instagram && <span>📷 {clienteSel.instagram}</span>}
                      {clienteSel.telegram && <span>✈️ {clienteSel.telegram}</span>}
                    </div>
                    {clienteSel.direccion && <p className="text-xs text-slate-400 mt-1">📍 {clienteSel.direccion}</p>}
                  </div>
                  <button type="button" onClick={() => setClienteSel(null)} className="text-xs text-slate-400 hover:text-slate-600 font-semibold shrink-0">
                    ✕ Cerrar ficha
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100">
                  <div className="bg-slate-50 rounded-2xl p-3">
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Última Compra</p>
                    <p className="text-sm font-bold text-slate-700">{diasDesdeUltimaCompra !== null ? `hace ${diasDesdeUltimaCompra} día(s)` : "Sin compras"}</p>
                  </div>
                  <div className={`rounded-2xl p-3 ${saldoCxcTotal > 0 ? "bg-rose-50" : "bg-slate-50"}`}>
                    <p className={`text-[9px] font-bold uppercase ${saldoCxcTotal > 0 ? "text-rose-400" : "text-slate-400"}`}>Saldo Cartera</p>
                    <p className={`text-sm font-bold ${saldoCxcTotal > 0 ? "text-rose-600" : "text-slate-700"}`}>
                      {cxcDisponible ? `$${fmt(saldoCxcTotal)}` : "N/D"}
                    </p>
                  </div>
                  <div className="bg-slate-50 rounded-2xl p-3">
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Visitas Registradas</p>
                    <p className="text-sm font-bold text-slate-700">{visitas.length}</p>
                  </div>
                  <div className="bg-slate-50 rounded-2xl p-3">
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Presupuestos/Pedidos</p>
                    <p className="text-sm font-bold text-slate-700">{ordenes.length}</p>
                  </div>
                </div>

                {segmentoSel && (
                  <div className="mt-3 bg-violet-50 border border-violet-100 rounded-2xl p-3.5 flex items-center gap-2.5">
                    <span className="text-lg">🎯</span>
                    <p className="text-xs font-bold text-violet-800">Acción sugerida: {segmentoSel.recomendacion}</p>
                  </div>
                )}
              </section>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  {/* HISTORIAL DE COMPRAS */}
                  <section className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-3">
                    <h4 className="text-sm font-bold text-slate-900">🛒 Historial de Compras</h4>
                    {tickets.length === 0 ? (
                      <p className="text-xs text-slate-400">Sin compras registradas.</p>
                    ) : (
                      <div className="divide-y divide-slate-100 max-h-52 overflow-y-auto">
                        {tickets.slice(0, 15).map((t) => (
                          <div key={t.id} className="flex justify-between items-center py-2 text-xs">
                            <span className="text-slate-500">{new Date(t.created_at).toLocaleDateString("es-VE")} · {fmt(t.peso)} kg/u</span>
                            <span className="font-mono font-bold text-slate-700">${fmt(t.monto_usd)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* CARTERA */}
                  {cxcDisponible && (
                    <section className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-3">
                      <h4 className="text-sm font-bold text-slate-900">💸 Cartera (CxC)</h4>
                      {cxc.length === 0 ? (
                        <p className="text-xs text-slate-400">Sin cuentas por cobrar registradas.</p>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {cxc.map((c) => (
                            <div key={c.id} className="flex justify-between items-center py-2 text-xs">
                              <span className="text-slate-500">Vence {new Date(c.fecha_vencimiento).toLocaleDateString("es-VE")} · {c.status}</span>
                              <span className="font-mono font-bold text-rose-600">${fmt(c.saldo)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  )}

                  {/* VISITAS Y ENCUESTAS */}
                  <section className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-3">
                    <h4 className="text-sm font-bold text-slate-900">🚗 Visitas y Encuestas de Mercadeo</h4>
                    {visitas.length === 0 ? (
                      <p className="text-xs text-slate-400">Sin visitas de campo registradas para este cliente.</p>
                    ) : (
                      <div className="space-y-2 max-h-52 overflow-y-auto">
                        {visitas.map((v) => (
                          <div key={v.id} className="bg-slate-50 rounded-2xl p-3 text-xs">
                            <p className="font-bold text-slate-700">{new Date(v.fecha_visita).toLocaleDateString("es-VE")}</p>
                            {v.comentarios && <p className="text-slate-500 mt-1">{v.comentarios}</p>}
                            {v.encuesta && (
                              <div className="mt-1.5 pt-1.5 border-t border-slate-200/60 text-slate-400 space-y-0.5">
                                {v.encuesta.inventario_cliente && <p>📦 Inventario: {v.encuesta.inventario_cliente}</p>}
                                {v.encuesta.rotacion_productos && <p>🔄 Rotación: {v.encuesta.rotacion_productos}</p>}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* PRESUPUESTOS Y PEDIDOS */}
                  <section className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-3">
                    <h4 className="text-sm font-bold text-slate-900">📝 Presupuestos y Pedidos</h4>
                    {ordenes.length === 0 ? (
                      <p className="text-xs text-slate-400">Sin presupuestos ni pedidos registrados.</p>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {ordenes.map((o) => (
                          <div key={o.id} className="flex justify-between items-center py-2 text-xs">
                            <span className="text-slate-500 capitalize">{o.tipo} · {new Date(o.created_at).toLocaleDateString("es-VE")} · {o.estatus}</span>
                            <span className="font-mono font-bold text-slate-700">${fmt(o.total_usd)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* LIBRO DE FALTANTES */}
                  <section className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
                    <h4 className="text-sm font-bold text-slate-900">📋 Libro de Faltantes</h4>
                    <form onSubmit={registrarFaltante} className="grid grid-cols-2 gap-3 bg-slate-50/50 p-3 rounded-2xl">
                      <input className={inputCls} value={itemFaltante} onChange={(e) => setItemFaltante(e.target.value)} placeholder="Producto / sugerencia" />
                      <input className={inputCls} value={notasFaltante} onChange={(e) => setNotasFaltante(e.target.value)} placeholder="Notas (opcional)" />
                      <button type="submit" className="col-span-2 bg-slate-900 hover:bg-slate-700 text-white rounded-xl py-2 text-xs font-bold transition-all">
                        Registrar Petición
                      </button>
                    </form>

                    {faltantesCliente.length === 0 ? (
                      <p className="text-xs text-slate-400">Sin faltantes registrados para este cliente.</p>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {faltantesCliente.map((f) => (
                          <div key={f.id} className="flex justify-between items-center py-2.5 text-xs gap-2">
                            <div>
                              <p className="font-medium text-slate-700">{f.item}</p>
                              <p className="text-[10px] text-slate-400">{f.status}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => generarMensajeAlo(f)}
                              disabled={generandoAlo === f.id}
                              className="rounded-full px-3 py-1.5 text-[11px] font-bold bg-violet-50 text-violet-700 hover:bg-violet-100 disabled:opacity-50 shrink-0"
                            >
                              {generandoAlo === f.id ? "Generando..." : "✨ ALO"}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* POSTVENTA */}
                  <section className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-3">
                    <h4 className="text-sm font-bold text-slate-900">🤖 Postventa</h4>
                    {logsCliente.length === 0 ? (
                      <p className="text-xs text-slate-400">Sin encuestas de postventa para este cliente.</p>
                    ) : (
                      <div className="space-y-2">
                        {logsCliente.map((l) => (
                          <div key={l.id} className="bg-slate-50 rounded-2xl p-3 text-xs">
                            <div className="flex justify-between items-center">
                              <span className="font-semibold text-slate-700">{l.tipo_mensaje}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badgeEnvio[l.status_envio] ?? "bg-slate-100 text-slate-600"}`}>{l.status_envio}</span>
                            </div>
                            {l.respuesta_cliente && <p className="text-slate-500 mt-1">{l.respuesta_cliente}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>

                {/* ALO */}
                <div className="lg:col-span-1">
                  <AgentPanel
                    key={clienteSel.id}
                    nombre="ALO"
                    rolDescripcion="Ventas y Gestión de Clientes"
                    avatarEmoji="✨"
                    colorTema="violet"
                    apiPath="/api/v1/agentes/alo"
                    saludoInicial={`Hola, soy ALO ✨ Ya revisé el perfil de ${clienteSel.nombre}. Pregúntame lo que necesites o usa un acceso rápido.`}
                    placeholder="Ej. ¿Qué le ofrezco a este cliente?"
                    extraBody={{ cliente_id: clienteSel.id }}
                    accionesRapidas={[
                      "¿Debe algo este cliente?",
                      "Redáctame un mensaje de reactivación",
                      "Resume su última visita",
                      "Sugiéreme qué ofrecerle",
                    ]}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* MENSAJE GENERADO POR ALO (acceso rápido por faltante) */}
      {aloModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">✨</span>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Mensaje de ALO</h3>
                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Listo para enviar por WhatsApp</p>
              </div>
            </div>
            <p className="bg-violet-50 border border-violet-100 text-violet-900 rounded-2xl p-4 text-sm whitespace-pre-wrap leading-relaxed">
              {aloModal.mensaje}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={copiarMensajeAlo}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl py-2.5 text-sm font-bold transition-all"
              >
                {copiado ? "✓ Copiado" : "📋 Copiar"}
              </button>
              {aloModal.telefono && (
                <a
                  href={`https://wa.me/${aloModal.telefono.replace(/\D/g, "")}?text=${encodeURIComponent(aloModal.mensaje)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 text-center bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-2.5 text-sm font-bold transition-all"
                >
                  💬 Enviar por WhatsApp
                </a>
              )}
            </div>
            <button
              type="button"
              onClick={() => setAloModal(null)}
              className="w-full text-center text-xs font-semibold text-slate-400 hover:text-slate-600"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
