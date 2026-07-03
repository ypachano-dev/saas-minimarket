import { useState, useEffect, type FormEvent } from "react";
import apiClient from "../api/client";
import AgentPanel from "./AgentPanel";

interface CuentaTesoreria {
  id: number;
  banco: string;
  alias: string;
  moneda: string;
  numero_referencia: string | null;
  saldo_actual: number;
  status: string;
  saldo_cargado_por: string | null;
  saldo_fecha: string | null;
}

interface Movimiento {
  id: number;
  cuenta_id: number;
  tipo: string;
  monto: number;
  concepto: string;
  created_at: string;
}

interface SaldoCuentaItem {
  cuenta_id: number;
  banco: string;
  alias: string;
  moneda: string;
  saldo_actual: number;
  saldo_usd_equivalente: number;
  saldo_eur_equivalente: number;
  saldo_cargado_por: string | null;
  saldo_fecha: string | null;
}

interface ResumenTesoreria {
  saldo_total_usd_equivalente: number;
  saldo_total_eur_equivalente: number;
  tasa_bcv: number;
  tasa_eur: number;
  cuentas: SaldoCuentaItem[];
}

// Catálogo de bancos con colores de marca
const BANCOS: { value: string; label: string; bg: string; text: string; abbr: string }[] = [
  { value: "BANESCO",           label: "Banesco",         bg: "#FF6B1A", text: "#fff", abbr: "BAN" },
  { value: "BNC",               label: "BNC",             bg: "#1A4B8F", text: "#fff", abbr: "BNC" },
  { value: "PROVINCIAL",        label: "Provincial",      bg: "#004684", text: "#fff", abbr: "PRO" },
  { value: "BANCO_DE_VENEZUELA",label: "Bco. Venezuela",  bg: "#CC2200", text: "#fff", abbr: "BDV" },
  { value: "BANGENTE",          label: "Bangente",        bg: "#00897B", text: "#fff", abbr: "BNG" },
  { value: "MERCANTIL",         label: "Mercantil",       bg: "#1C1C1C", text: "#fff", abbr: "MER" },
  { value: "BICENTENARIO",      label: "Bicentenario",    bg: "#7B2D8B", text: "#fff", abbr: "BIC" },
  { value: "EXTERIOR",          label: "Banco Exterior",  bg: "#E65100", text: "#fff", abbr: "EXT" },
  { value: "BOD",               label: "BOD",             bg: "#1565C0", text: "#fff", abbr: "BOD" },
  { value: "PLAZA",             label: "Bco. Plaza",      bg: "#2E7D32", text: "#fff", abbr: "PLZ" },
  { value: "BINANCE",           label: "Binance",         bg: "#F0B90B", text: "#1C1C1C", abbr: "BNB" },
  { value: "EFECTIVO_BS",       label: "Efectivo Bs",     bg: "#059669", text: "#fff", abbr: "EBs" },
  { value: "EFECTIVO_USD",      label: "Efectivo $",      bg: "#0284C7", text: "#fff", abbr: "E$"  },
  { value: "ZELLE",             label: "Zelle",           bg: "#6D28D9", text: "#fff", abbr: "ZLL" },
  { value: "PAYPAL",            label: "PayPal",          bg: "#003087", text: "#fff", abbr: "PP"  },
  { value: "OTRO",              label: "Otro banco...",   bg: "#6B7280", text: "#fff", abbr: "OTR" },
];

function bancoInfo(value: string) {
  return BANCOS.find((b) => b.value === value.toUpperCase()) ?? { value, label: value, bg: "#6B7280", text: "#fff", abbr: value.substring(0, 3).toUpperCase() };
}

function BankBadge({ banco, size = "sm" }: { banco: string; size?: "sm" | "lg" }) {
  const info = bancoInfo(banco);
  const dim = size === "lg" ? "w-12 h-12 text-sm" : "w-9 h-9 text-[10px]";
  return (
    <div
      className={`${dim} rounded-xl flex items-center justify-center font-black flex-shrink-0 shadow-sm`}
      style={{ backgroundColor: info.bg, color: info.text }}
    >
      {info.abbr}
    </div>
  );
}

const MONEDAS = ["USD", "VES", "EUR", "USDT"];

const inputCls = "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const labelCls = "text-xs font-semibold uppercase tracking-wider text-slate-400";
const fmt = (n: number | string) => Number(n).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtFecha = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : null;

const MONEDA_SIMBOLO: Record<string, string> = { USD: "$", EUR: "€", VES: "Bs.", USDT: "₮" };

export default function ModuloTesoreria() {
  const [cuentas, setCuentas] = useState<CuentaTesoreria[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [resumen, setResumen] = useState<ResumenTesoreria | null>(null);
  const [mostrarFormCuenta, setMostrarFormCuenta] = useState(false);
  const [mostrarFormMovimiento, setMostrarFormMovimiento] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [ajustando, setAjustando] = useState<CuentaTesoreria | null>(null);
  const [nuevoSaldo, setNuevoSaldo] = useState("");
  const [conceptoAjuste, setConceptoAjuste] = useState("Corrección de saldo");

  const [nuevaCuenta, setNuevaCuenta] = useState({
    banco: BANCOS[0].value,
    bancoLibre: "",
    alias: "",
    moneda: "USD",
    saldo_actual: "",
  });
  const [nuevoMovimiento, setNuevoMovimiento] = useState({ cuenta_id: "", tipo: "ingreso", monto: "", concepto: "" });

  function cargarTodo() {
    apiClient.get<CuentaTesoreria[]>("/api/v1/tesoreria/cuentas").then((r) => setCuentas(r.data)).catch(() => {});
    apiClient.get<Movimiento[]>("/api/v1/tesoreria/movimientos", { params: { limit: 20 } }).then((r) => setMovimientos(r.data)).catch(() => {});
    apiClient.get<ResumenTesoreria>("/api/v1/tesoreria/resumen").then((r) => setResumen(r.data)).catch(() => {});
  }

  useEffect(() => { cargarTodo(); }, []);

  async function crearCuenta(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    const bancoFinal = nuevaCuenta.banco === "OTRO" ? nuevaCuenta.bancoLibre.trim().toUpperCase() : nuevaCuenta.banco;
    if (!bancoFinal) { setMsg({ tipo: "error", texto: "Especifica el nombre del banco." }); return; }
    if (!nuevaCuenta.alias.trim()) { setMsg({ tipo: "error", texto: "El alias de la cuenta es obligatorio." }); return; }
    try {
      await apiClient.post("/api/v1/tesoreria/cuentas", {
        banco: bancoFinal,
        alias: nuevaCuenta.alias.trim(),
        moneda: nuevaCuenta.moneda,
        saldo_actual: Number(nuevaCuenta.saldo_actual) || 0,
      });
      setNuevaCuenta({ banco: BANCOS[0].value, bancoLibre: "", alias: "", moneda: "USD", saldo_actual: "" });
      setMostrarFormCuenta(false);
      setMsg({ tipo: "ok", texto: "Cuenta registrada con éxito." });
      cargarTodo();
    } catch (err: any) {
      setMsg({ tipo: "error", texto: err.response?.data?.detail ?? "No se pudo registrar la cuenta." });
    }
  }

  async function crearMovimiento(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!nuevoMovimiento.cuenta_id || !nuevoMovimiento.monto || !nuevoMovimiento.concepto.trim()) {
      setMsg({ tipo: "error", texto: "Cuenta, monto y concepto son obligatorios." });
      return;
    }
    try {
      await apiClient.post("/api/v1/tesoreria/movimientos", {
        cuenta_id: Number(nuevoMovimiento.cuenta_id),
        tipo: nuevoMovimiento.tipo,
        monto: Number(nuevoMovimiento.monto),
        concepto: nuevoMovimiento.concepto.trim(),
      });
      setNuevoMovimiento({ cuenta_id: "", tipo: "ingreso", monto: "", concepto: "" });
      setMostrarFormMovimiento(false);
      setMsg({ tipo: "ok", texto: "Movimiento registrado." });
      cargarTodo();
    } catch (err: any) {
      setMsg({ tipo: "error", texto: err.response?.data?.detail ?? "No se pudo registrar el movimiento." });
    }
  }

  async function confirmarAjusteSaldo() {
    if (!ajustando || nuevoSaldo === "") return;
    try {
      await apiClient.patch(`/api/v1/tesoreria/cuentas/${ajustando.id}/saldo`, {
        saldo_nuevo: Number(nuevoSaldo),
        concepto: conceptoAjuste || "Corrección de saldo",
      });
      setAjustando(null);
      setNuevoSaldo("");
      setConceptoAjuste("Corrección de saldo");
      setMsg({ tipo: "ok", texto: "Saldo actualizado con éxito." });
      cargarTodo();
    } catch (err: any) {
      setMsg({ tipo: "error", texto: err.response?.data?.detail ?? "Error al ajustar el saldo." });
    }
  }

  // Mapear resumen.cuentas por cuenta_id para obtener equivalencias sin re-calcular
  const resumenMap = new Map<number, SaldoCuentaItem>();
  resumen?.cuentas.forEach((c) => resumenMap.set(c.cuenta_id, c));

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-5">

      {/* ── Header con saldo consolidado y tasas ── */}
      <div className="bg-white rounded-3xl p-5 sm:p-8 border border-slate-100 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 flex items-center gap-2">
              🏦 Bancos y Tesorería
            </h1>
            <p className="text-sm text-slate-500 font-medium mt-1">Saldos consolidados, movimientos y flujo de caja</p>
          </div>
          {resumen && (
            <div className="flex gap-3 flex-wrap">
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 text-right min-w-[130px]">
                <span className="block text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Total USD</span>
                <span className="font-mono font-black text-xl text-emerald-700">${fmt(resumen.saldo_total_usd_equivalente)}</span>
              </div>
              {Number(resumen.tasa_eur) > 0 && (
                <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 text-right min-w-[130px]">
                  <span className="block text-[10px] font-bold text-blue-500 uppercase tracking-wider">Total EUR</span>
                  <span className="font-mono font-black text-xl text-blue-700">€{fmt(resumen.saldo_total_eur_equivalente)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tasas BCV */}
        {resumen && (Number(resumen.tasa_bcv) > 0 || Number(resumen.tasa_eur) > 0) && (
          <div className="flex flex-wrap gap-3 pt-1 border-t border-slate-100">
            {Number(resumen.tasa_bcv) > 0 && (
              <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2 text-xs">
                <span className="text-slate-400 font-medium">BCV USD/VES</span>
                <span className="font-mono font-bold text-slate-700">Bs. {fmt(resumen.tasa_bcv)}</span>
              </div>
            )}
            {Number(resumen.tasa_eur) > 0 && (
              <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2 text-xs">
                <span className="text-slate-400 font-medium">BCV EUR/VES</span>
                <span className="font-mono font-bold text-slate-700">Bs. {fmt(resumen.tasa_eur)}</span>
              </div>
            )}
            <span className="text-[10px] text-slate-400 flex items-center">Tasas actualizadas automáticamente desde el BCV</span>
          </div>
        )}
      </div>

      {msg && (
        <p className={`text-sm font-medium px-4 py-2 rounded-xl ${msg.tipo === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
          {msg.texto}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">

          {/* ── CUENTAS ── */}
          <section className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">💳 Cuentas y Medios de Pago</h3>
              <button
                type="button"
                onClick={() => setMostrarFormCuenta((v) => !v)}
                className="bg-slate-950 hover:bg-blue-600 text-white rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all"
              >
                {mostrarFormCuenta ? "Cancelar" : "+ Agregar Cuenta"}
              </button>
            </div>

            {mostrarFormCuenta && (
              <form onSubmit={crearCuenta} className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <label className="flex flex-col">
                  <span className={labelCls}>Banco / Medio de Pago</span>
                  <select className={inputCls} value={nuevaCuenta.banco} onChange={(e) => setNuevaCuenta((p) => ({ ...p, banco: e.target.value }))}>
                    {BANCOS.map((b) => (
                      <option key={b.value} value={b.value}>{b.label}</option>
                    ))}
                  </select>
                  {nuevaCuenta.banco === "OTRO" && (
                    <input
                      className={`${inputCls} mt-2`}
                      value={nuevaCuenta.bancoLibre}
                      onChange={(e) => setNuevaCuenta((p) => ({ ...p, bancoLibre: e.target.value }))}
                      placeholder="Nombre del banco..."
                      maxLength={40}
                    />
                  )}
                </label>
                <label className="flex flex-col">
                  <span className={labelCls}>Alias / Descripción</span>
                  <input className={inputCls} value={nuevaCuenta.alias} onChange={(e) => setNuevaCuenta((p) => ({ ...p, alias: e.target.value }))} placeholder="Ej. Cuenta Principal" />
                </label>
                <label className="flex flex-col">
                  <span className={labelCls}>Moneda</span>
                  <select className={inputCls} value={nuevaCuenta.moneda} onChange={(e) => setNuevaCuenta((p) => ({ ...p, moneda: e.target.value }))}>
                    {MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
                <label className="flex flex-col">
                  <span className={labelCls}>Saldo Inicial</span>
                  <input type="number" step="0.01" min="0" className={inputCls} value={nuevaCuenta.saldo_actual} onChange={(e) => setNuevaCuenta((p) => ({ ...p, saldo_actual: e.target.value }))} placeholder="0.00" />
                </label>
                <button type="submit" className="sm:col-span-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2.5 text-sm font-bold transition-all">
                  Guardar Cuenta
                </button>
              </form>
            )}

            {cuentas.length === 0 ? (
              <p className="text-center text-sm text-slate-400 py-8">Sin cuentas registradas. Agrega tu primera cuenta o medio de pago.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {cuentas.map((c) => {
                  const info = bancoInfo(c.banco);
                  const simbolo = MONEDA_SIMBOLO[c.moneda] ?? "$";
                  const resumenCuenta = resumenMap.get(c.id);
                  return (
                    <div key={c.id} className="rounded-2xl border border-slate-200 p-4 bg-slate-50/50 space-y-3">
                      {/* Encabezado */}
                      <div className="flex items-center gap-3">
                        <BankBadge banco={c.banco} size="lg" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-700 truncate">{info.label}</span>
                            <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full flex-shrink-0">{c.moneda}</span>
                          </div>
                          <p className="text-xs text-slate-500 truncate">{c.alias}</p>
                        </div>
                      </div>

                      {/* Saldo */}
                      <div>
                        <p className="font-mono font-black text-2xl text-slate-900">
                          {simbolo} {fmt(c.saldo_actual)}
                        </p>
                        {/* Equivalencias en otras divisas */}
                        {resumenCuenta && c.moneda === "VES" && (
                          <div className="flex gap-3 mt-1">
                            {Number(resumen?.tasa_bcv) > 0 && (
                              <span className="text-xs text-slate-400">≈ <span className="font-semibold text-emerald-600">${fmt(resumenCuenta.saldo_usd_equivalente)}</span></span>
                            )}
                            {Number(resumen?.tasa_eur) > 0 && (
                              <span className="text-xs text-slate-400">≈ <span className="font-semibold text-blue-600">€{fmt(resumenCuenta.saldo_eur_equivalente)}</span></span>
                            )}
                          </div>
                        )}
                        {resumenCuenta && c.moneda === "USD" && Number(resumen?.tasa_eur) > 0 && (
                          <span className="text-xs text-slate-400">≈ <span className="font-semibold text-blue-600">€{fmt(resumenCuenta.saldo_eur_equivalente)}</span></span>
                        )}
                        {resumenCuenta && c.moneda === "EUR" && Number(resumen?.tasa_bcv) > 0 && (
                          <span className="text-xs text-slate-400">≈ <span className="font-semibold text-emerald-600">${fmt(resumenCuenta.saldo_usd_equivalente)}</span></span>
                        )}
                      </div>

                      {/* Quién y cuándo cargó */}
                      {(c.saldo_cargado_por || c.saldo_fecha) && (
                        <p className="text-[10px] text-slate-400 border-t border-slate-100 pt-2">
                          {c.saldo_cargado_por && <span>👤 {c.saldo_cargado_por}</span>}
                          {c.saldo_fecha && <span className="ml-2">· 🕐 {fmtFecha(c.saldo_fecha)}</span>}
                        </p>
                      )}

                      {/* Acción: ajustar saldo */}
                      <button
                        type="button"
                        onClick={() => { setAjustando(c); setNuevoSaldo(String(Number(c.saldo_actual))); setConceptoAjuste("Corrección de saldo"); setMsg(null); }}
                        className="w-full text-xs font-bold text-blue-600 hover:text-white hover:bg-blue-600 border border-blue-200 hover:border-blue-600 rounded-xl py-1.5 transition-all"
                      >
                        Ajustar Saldo
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── MOVIMIENTOS ── */}
          <section className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">📒 Movimientos Recientes</h3>
              <button
                type="button"
                onClick={() => setMostrarFormMovimiento((v) => !v)}
                disabled={cuentas.length === 0}
                className="bg-slate-950 hover:bg-blue-600 text-white rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all disabled:opacity-40"
              >
                {mostrarFormMovimiento ? "Cancelar" : "+ Registrar Movimiento"}
              </button>
            </div>

            {mostrarFormMovimiento && (
              <form onSubmit={crearMovimiento} className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <label className="flex flex-col">
                  <span className={labelCls}>Cuenta</span>
                  <select className={inputCls} value={nuevoMovimiento.cuenta_id} onChange={(e) => setNuevoMovimiento((p) => ({ ...p, cuenta_id: e.target.value }))}>
                    <option value="">Seleccionar...</option>
                    {cuentas.map((c) => (
                      <option key={c.id} value={c.id}>{bancoInfo(c.banco).label} · {c.alias}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col">
                  <span className={labelCls}>Tipo</span>
                  <select className={inputCls} value={nuevoMovimiento.tipo} onChange={(e) => setNuevoMovimiento((p) => ({ ...p, tipo: e.target.value }))}>
                    <option value="ingreso">Ingreso</option>
                    <option value="egreso">Egreso</option>
                  </select>
                </label>
                <label className="flex flex-col">
                  <span className={labelCls}>Monto</span>
                  <input type="number" step="0.01" min="0.01" className={inputCls} value={nuevoMovimiento.monto} onChange={(e) => setNuevoMovimiento((p) => ({ ...p, monto: e.target.value }))} placeholder="0.00" />
                </label>
                <label className="flex flex-col">
                  <span className={labelCls}>Concepto</span>
                  <input className={inputCls} value={nuevoMovimiento.concepto} onChange={(e) => setNuevoMovimiento((p) => ({ ...p, concepto: e.target.value }))} placeholder="Ej. Pago a proveedor" />
                </label>
                <button type="submit" className="sm:col-span-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2.5 text-sm font-bold transition-all">
                  Guardar Movimiento
                </button>
              </form>
            )}

            {movimientos.length === 0 ? (
              <p className="text-center text-sm text-slate-400 py-8">Sin movimientos registrados todavía.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {movimientos.map((m) => {
                  const cuenta = cuentas.find((c) => c.id === m.cuenta_id);
                  return (
                    <div key={m.id} className="flex items-center justify-between py-2.5 text-sm">
                      <div>
                        <p className="font-semibold text-slate-700">{m.concepto}</p>
                        <p className="text-[11px] text-slate-400">
                          {cuenta ? `${bancoInfo(cuenta.banco).label} · ${cuenta.alias}` : `Cuenta #${m.cuenta_id}`}
                          {" · "}{new Date(m.created_at).toLocaleDateString("es-VE")}
                        </p>
                      </div>
                      <span className={`font-mono font-bold text-sm ${m.tipo === "ingreso" ? "text-emerald-600" : "text-rose-600"}`}>
                        {m.tipo === "ingreso" ? "+" : "−"}{MONEDA_SIMBOLO[cuenta?.moneda ?? "USD"] ?? "$"}{fmt(m.monto)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* ── PANEL DE YHORGE ── */}
        <div className="lg:col-span-1">
          <AgentPanel
            nombre="YHORGE"
            rolDescripcion="Cobranza y Tesorería"
            avatarEmoji="🧮"
            colorTema="emerald"
            apiPath="/api/v1/agentes/yhorge"
            saludoInicial="Hola, soy YHORGE. Te ayudo a priorizar cobros y vigilar tu flujo de caja. Pregúntame lo que necesites."
            placeholder="Ej. ¿Puedo cubrir mis pagos este mes?"
          />
        </div>
      </div>

      {/* ── MODAL: Ajustar Saldo ── */}
      {ajustando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <BankBadge banco={ajustando.banco} size="lg" />
              <div>
                <h3 className="text-lg font-bold text-slate-900">Ajustar Saldo</h3>
                <p className="text-xs text-slate-400">{ajustando.alias} · {ajustando.moneda}</p>
              </div>
            </div>
            <label className="flex flex-col">
              <span className={labelCls}>Saldo Actual Confirmado ({ajustando.moneda})</span>
              <input
                type="number"
                step="0.01"
                min="0"
                className={inputCls}
                value={nuevoSaldo}
                onChange={(e) => setNuevoSaldo(e.target.value)}
                autoFocus
                placeholder="0.00"
              />
              <span className="text-[10px] text-slate-400 mt-1">
                Saldo anterior: {MONEDA_SIMBOLO[ajustando.moneda] ?? "$"} {fmt(ajustando.saldo_actual)}
              </span>
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>Motivo del Ajuste</span>
              <input
                className={inputCls}
                value={conceptoAjuste}
                onChange={(e) => setConceptoAjuste(e.target.value)}
                placeholder="Ej. Confirmación con estado de cuenta"
              />
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setAjustando(null)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl py-2.5 text-sm font-bold transition-all">
                Cancelar
              </button>
              <button type="button" onClick={confirmarAjusteSaldo} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-2.5 text-sm font-bold transition-all">
                Confirmar Saldo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
