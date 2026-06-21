import { useState, useEffect, useCallback } from "react";
import apiClient from "../api/client";

interface RenglonGasto {
  id: number;
  nombre: string;
  categoria: string;
  monto_esperado_usd: number;
  frecuencia: string;
  activo: boolean;
  periodo_label: string;
  monto_pagado_periodo: number;
  saldo_pendiente_periodo: number;
}

interface PagoRenglon {
  id: number;
  renglon_id: number;
  renglon_nombre: string;
  monto_usd: number;
  fecha_pago: string;
  comprobante_url: string | null;
  observaciones: string | null;
  registrado_por_nombre: string | null;
  created_at: string;
}

const CATEGORIAS: { key: string; emoji: string; label: string }[] = [
  { key: "servicios", emoji: "💡", label: "Servicios" },
  { key: "nomina", emoji: "👥", label: "Nómina" },
  { key: "alquileres", emoji: "🏠", label: "Alquileres" },
  { key: "mantenimiento", emoji: "🔧", label: "Mantenimiento" },
  { key: "otro", emoji: "📋", label: "Otro" },
];

const FRECUENCIAS = [
  { key: "semanal", label: "Semanal" },
  { key: "quincenal", label: "Quincenal" },
  { key: "mensual", label: "Mensual" },
  { key: "unico", label: "Pago único" },
];

const fmt = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const emojiCategoria = (cat: string) => CATEGORIAS.find((c) => c.key === cat)?.emoji ?? "📋";
const labelCategoria = (cat: string) => CATEGORIAS.find((c) => c.key === cat)?.label ?? cat;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
  });
}

export default function PanelGastosFijos() {
  const [renglones, setRenglones] = useState<RenglonGasto[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevaCategoria, setNuevaCategoria] = useState("servicios");
  const [nuevoMonto, setNuevoMonto] = useState("");
  const [nuevaFrecuencia, setNuevaFrecuencia] = useState("mensual");
  const [guardandoRenglon, setGuardandoRenglon] = useState(false);

  const [renglonPago, setRenglonPago] = useState<RenglonGasto | null>(null);
  const [montoPago, setMontoPago] = useState("");
  const [observacionesPago, setObservacionesPago] = useState("");
  const [comprobanteBase64, setComprobanteBase64] = useState<string | null>(null);
  const [comprobanteNombre, setComprobanteNombre] = useState("");
  const [guardandoPago, setGuardandoPago] = useState(false);

  const [mostrarHistorial, setMostrarHistorial] = useState(false);
  const [historial, setHistorial] = useState<PagoRenglon[]>([]);

  const cargarRenglones = useCallback(() => {
    setCargando(true);
    apiClient.get<RenglonGasto[]>("/api/v1/gastos-fijos/renglones")
      .then((res) => { setRenglones(res.data); setError(""); })
      .catch(() => setError("No se pudieron cargar los renglones de gastos fijos."))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => { cargarRenglones(); }, [cargarRenglones]);

  function cargarHistorial() {
    apiClient.get<PagoRenglon[]>("/api/v1/gastos-fijos/pagos")
      .then((res) => setHistorial(res.data))
      .catch(() => setHistorial([]));
  }

  async function crearRenglon() {
    if (!nuevoNombre.trim() || !nuevoMonto || Number(nuevoMonto) <= 0) {
      setError("Indica un nombre y un monto esperado mayor a cero.");
      return;
    }
    setGuardandoRenglon(true);
    try {
      await apiClient.post("/api/v1/gastos-fijos/renglones", {
        nombre: nuevoNombre.trim(),
        categoria: nuevaCategoria,
        monto_esperado_usd: Number(nuevoMonto),
        frecuencia: nuevaFrecuencia,
      });
      setNuevoNombre(""); setNuevoMonto(""); setNuevaCategoria("servicios"); setNuevaFrecuencia("mensual");
      setMostrarNuevo(false);
      cargarRenglones();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? "No se pudo crear el renglón.");
    } finally {
      setGuardandoRenglon(false);
    }
  }

  async function registrarPago() {
    if (!renglonPago || !montoPago || Number(montoPago) <= 0) return;
    setGuardandoPago(true);
    try {
      await apiClient.post(`/api/v1/gastos-fijos/renglones/${renglonPago.id}/pagos`, {
        monto_usd: Number(montoPago),
        comprobante_url: comprobanteBase64 || undefined,
        observaciones: observacionesPago.trim() || undefined,
      });
      setRenglonPago(null);
      setMontoPago(""); setObservacionesPago(""); setComprobanteBase64(null); setComprobanteNombre("");
      cargarRenglones();
      if (mostrarHistorial) cargarHistorial();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? "No se pudo registrar el pago.");
    } finally {
      setGuardandoPago(false);
    }
  }

  async function onArchivoComprobante(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setComprobanteNombre(file.name);
    setComprobanteBase64(await fileToBase64(file));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
          💸 Gastos Fijos del Negocio (Servicios · Nómina · Alquileres · Mantenimiento)
        </h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMostrarHistorial((v) => { if (!v) cargarHistorial(); return !v; })}
            className="text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-full transition-all"
          >
            🧾 {mostrarHistorial ? "Ocultar historial" : "Historial de pagos"}
          </button>
          <button
            type="button"
            onClick={() => setMostrarNuevo((v) => !v)}
            className="text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 px-3 py-1.5 rounded-full transition-all"
          >
            + Nuevo renglón
          </button>
        </div>
      </div>

      {error && <p className="text-xs font-semibold text-rose-600 bg-rose-50 px-3 py-2 rounded-xl">{error}</p>}

      {mostrarNuevo && (
        <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-3 items-end animate-fade-in">
          <label className="flex flex-col">
            <span className="text-[10px] font-bold uppercase text-slate-400 mb-1">Nombre</span>
            <input value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} placeholder="Ej: Electricidad" className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
          <label className="flex flex-col">
            <span className="text-[10px] font-bold uppercase text-slate-400 mb-1">Categoría</span>
            <select value={nuevaCategoria} onChange={(e) => setNuevaCategoria(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              {CATEGORIAS.map((c) => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col">
            <span className="text-[10px] font-bold uppercase text-slate-400 mb-1">Monto esperado (USD)</span>
            <input type="number" step="0.01" value={nuevoMonto} onChange={(e) => setNuevoMonto(e.target.value)} placeholder="0.00" className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono" />
          </label>
          <label className="flex flex-col">
            <span className="text-[10px] font-bold uppercase text-slate-400 mb-1">Frecuencia</span>
            <select value={nuevaFrecuencia} onChange={(e) => setNuevaFrecuencia(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              {FRECUENCIAS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </label>
          <button type="button" disabled={guardandoRenglon} onClick={crearRenglon} className="md:col-span-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-sm py-2.5 rounded-xl transition-all">
            {guardandoRenglon ? "Guardando..." : "Guardar renglón"}
          </button>
        </div>
      )}

      {cargando ? (
        <p className="text-xs text-slate-400 px-1 py-6 text-center">Cargando gastos fijos...</p>
      ) : renglones.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
          <p className="text-sm font-bold text-slate-600">Sin renglones de gastos fijos registrados todavía.</p>
          <p className="text-xs text-slate-400 mt-1">Usa "+ Nuevo renglón" para empezar a cargar Servicios, Nómina, Alquileres, Mantenimiento, etc.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {renglones.map((r) => {
            const progreso = r.monto_esperado_usd > 0 ? Math.min(100, (r.monto_pagado_periodo / r.monto_esperado_usd) * 100) : 0;
            const pagado = r.saldo_pendiente_periodo <= 0 && r.monto_esperado_usd > 0;
            return (
              <div key={r.id} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-sm font-black text-slate-900">{emojiCategoria(r.categoria)} {r.nombre}</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">{labelCategoria(r.categoria)} · {r.periodo_label}</p>
                  </div>
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${pagado ? "bg-emerald-100 text-emerald-700" : r.monto_pagado_periodo > 0 ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"}`}>
                    {pagado ? "Pagado" : r.monto_pagado_periodo > 0 ? "Parcial" : "Pendiente"}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${pagado ? "bg-emerald-500" : "bg-blue-500"}`} style={{ width: `${progreso}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] font-bold text-slate-500">
                    <span>Pagado ${fmt(r.monto_pagado_periodo)}</span>
                    <span>Esperado ${fmt(r.monto_esperado_usd)}</span>
                  </div>
                </div>

                <div className="flex justify-between items-center border-t border-slate-50 pt-2.5">
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase block">Saldo pendiente</span>
                    <span className={`text-sm font-mono font-black ${r.saldo_pendiente_periodo > 0 ? "text-rose-600" : "text-emerald-600"}`}>${fmt(r.saldo_pendiente_periodo)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setRenglonPago(r); setMontoPago(r.saldo_pendiente_periodo > 0 ? String(r.saldo_pendiente_periodo) : ""); }}
                    className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-xl transition-all"
                  >
                    Abonar / Pagar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {mostrarHistorial && (
        <div className="rounded-3xl border border-slate-100 bg-white shadow-sm overflow-hidden">
          <div className="p-3 bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase text-slate-500">Historial de Pagos (últimos 50)</div>
          <div className="divide-y divide-slate-50 max-h-80 overflow-y-auto">
            {historial.length === 0 && <p className="text-xs text-slate-400 text-center py-6">Sin pagos registrados todavía.</p>}
            {historial.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-2.5 text-xs">
                <div>
                  <span className="font-bold text-slate-800">{p.renglon_nombre}</span>
                  <span className="text-slate-400"> · {new Date(p.fecha_pago).toLocaleDateString("es-VE")} · {p.registrado_por_nombre ?? "—"}</span>
                  {p.observaciones && <p className="text-[10px] text-slate-400">{p.observaciones}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-black text-slate-800">${fmt(p.monto_usd)}</span>
                  {p.comprobante_url && (
                    <a href={p.comprobante_url} target="_blank" rel="noreferrer" className="text-blue-600 font-bold text-[10px] underline">Recibo</a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal de Abono/Pago */}
      {renglonPago && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 relative">
            <button type="button" onClick={() => setRenglonPago(null)} className="absolute top-4 right-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full w-8 h-8 flex items-center justify-center font-bold transition-all">✕</button>
            <h3 className="text-lg font-bold text-slate-900">{emojiCategoria(renglonPago.categoria)} Abonar / Pagar — {renglonPago.nombre}</h3>
            <p className="text-xs text-slate-400 mt-0.5 mb-4">Saldo pendiente del periodo ({renglonPago.periodo_label}): <strong className="text-rose-600">${fmt(renglonPago.saldo_pendiente_periodo)}</strong></p>

            <div className="space-y-3">
              <label className="flex flex-col">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Monto a pagar (USD)</span>
                <input type="number" step="0.01" autoFocus value={montoPago} onChange={(e) => setMontoPago(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </label>
              <label className="flex flex-col">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Recibo / Comprobante (opcional)</span>
                <input type="file" accept="image/*,application/pdf" onChange={onArchivoComprobante} className="text-xs" />
                {comprobanteNombre && <span className="text-[10px] text-emerald-600 font-semibold mt-1">Adjunto: {comprobanteNombre}</span>}
              </label>
              <label className="flex flex-col">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Observaciones (opcional)</span>
                <textarea rows={2} value={observacionesPago} onChange={(e) => setObservacionesPago(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </label>

              <button type="button" disabled={guardandoPago || !montoPago} onClick={registrarPago} className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm py-2.5 rounded-xl transition-all">
                {guardandoPago ? "Registrando..." : "Registrar pago y enviar a historial"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
