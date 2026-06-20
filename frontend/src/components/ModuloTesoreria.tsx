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
}

interface Movimiento {
  id: number;
  cuenta_id: number;
  tipo: string;
  monto: number;
  concepto: string;
  created_at: string;
}

interface ResumenTesoreria {
  saldo_total_usd_equivalente: number;
  tasa_bcv: number;
  cuentas: { cuenta_id: number; banco: string; alias: string; moneda: string; saldo_actual: number; saldo_usd_equivalente: number }[];
}

// Catálogo de bancos/medios de pago soportados (debe coincidir con BANCOS_VALIDOS del backend)
const BANCOS: { value: string; label: string; emoji: string }[] = [
  { value: "BANESCO", label: "Banesco", emoji: "🟧" },
  { value: "BNC", label: "BNC", emoji: "🟦" },
  { value: "PROVINCIAL", label: "Provincial", emoji: "🟩" },
  { value: "BANCO_DE_VENEZUELA", label: "Banco de Venezuela", emoji: "🟨" },
  { value: "BANGENTE", label: "Bangente", emoji: "🟪" },
  { value: "MERCANTIL", label: "Mercantil", emoji: "⬛" },
  { value: "BINANCE", label: "Binance", emoji: "🟡" },
  { value: "EFECTIVO_BS", label: "Efectivo Bs", emoji: "💵" },
  { value: "EFECTIVO_USD", label: "Efectivo $", emoji: "💵" },
  { value: "ZELLE", label: "Zelle", emoji: "💜" },
];

const bancoInfo = (value: string) => BANCOS.find((b) => b.value === value) ?? { value, label: value, emoji: "🏦" };

const inputCls = "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const labelCls = "text-xs font-semibold uppercase tracking-wider text-slate-400";
// Los campos Decimal del backend llegan como string en el JSON (ej. "50000.00"); Number()
// los normaliza antes de formatear, igual que el resto de los módulos de este proyecto.
const fmt = (n: number | string) => Number(n).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ModuloTesoreria() {
  const [cuentas, setCuentas] = useState<CuentaTesoreria[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [resumen, setResumen] = useState<ResumenTesoreria | null>(null);
  const [mostrarFormCuenta, setMostrarFormCuenta] = useState(false);
  const [mostrarFormMovimiento, setMostrarFormMovimiento] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const [nuevaCuenta, setNuevaCuenta] = useState({ banco: BANCOS[0].value, alias: "", moneda: "USD", saldo_actual: "" });
  const [nuevoMovimiento, setNuevoMovimiento] = useState({ cuenta_id: "", tipo: "ingreso", monto: "", concepto: "" });

  function cargarTodo() {
    apiClient.get<CuentaTesoreria[]>("/api/v1/tesoreria/cuentas").then((res) => setCuentas(res.data)).catch(() => {});
    apiClient.get<Movimiento[]>("/api/v1/tesoreria/movimientos", { params: { limit: 15 } }).then((res) => setMovimientos(res.data)).catch(() => {});
    apiClient.get<ResumenTesoreria>("/api/v1/tesoreria/resumen").then((res) => setResumen(res.data)).catch(() => {});
  }

  useEffect(() => { cargarTodo(); }, []);

  async function crearCuenta(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!nuevaCuenta.alias.trim()) {
      setMsg({ tipo: "error", texto: "El alias de la cuenta es obligatorio." });
      return;
    }
    try {
      await apiClient.post("/api/v1/tesoreria/cuentas", {
        banco: nuevaCuenta.banco,
        alias: nuevaCuenta.alias.trim(),
        moneda: nuevaCuenta.moneda,
        saldo_actual: Number(nuevaCuenta.saldo_actual) || 0,
      });
      setNuevaCuenta({ banco: BANCOS[0].value, alias: "", moneda: "USD", saldo_actual: "" });
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
      setMsg({ tipo: "ok", texto: "Movimiento registrado con éxito." });
      cargarTodo();
    } catch (err: any) {
      setMsg({ tipo: "error", texto: err.response?.data?.detail ?? "No se pudo registrar el movimiento." });
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 flex items-center gap-2">🏦 Bancos y Tesorería</h1>
          <p className="text-sm text-slate-500 font-medium mt-1">Saldos consolidados, movimientos y flujo de caja</p>
        </div>
        {resumen && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-5 py-3 text-right">
            <span className="block text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Saldo Total Consolidado</span>
            <span className="font-mono font-black text-2xl text-emerald-700">${fmt(resumen.saldo_total_usd_equivalente)}</span>
          </div>
        )}
      </div>

      {msg && (
        <p className={`text-sm font-medium px-4 py-2 rounded-xl ${msg.tipo === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
          {msg.texto}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* CUENTAS */}
          <section className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4">
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
              <form onSubmit={crearCuenta} className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <label className="flex flex-col">
                  <span className={labelCls}>Banco / Medio de Pago</span>
                  <select className={inputCls} value={nuevaCuenta.banco} onChange={(e) => setNuevaCuenta((p) => ({ ...p, banco: e.target.value }))}>
                    {BANCOS.map((b) => (
                      <option key={b.value} value={b.value}>{b.emoji} {b.label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col">
                  <span className={labelCls}>Alias</span>
                  <input className={inputCls} value={nuevaCuenta.alias} onChange={(e) => setNuevaCuenta((p) => ({ ...p, alias: e.target.value }))} placeholder="Ej. Cuenta Principal" />
                </label>
                <label className="flex flex-col">
                  <span className={labelCls}>Moneda</span>
                  <select className={inputCls} value={nuevaCuenta.moneda} onChange={(e) => setNuevaCuenta((p) => ({ ...p, moneda: e.target.value }))}>
                    <option value="USD">USD</option>
                    <option value="VES">VES</option>
                    <option value="USDT">USDT</option>
                  </select>
                </label>
                <label className="flex flex-col">
                  <span className={labelCls}>Saldo Inicial</span>
                  <input type="number" step="0.01" className={inputCls} value={nuevaCuenta.saldo_actual} onChange={(e) => setNuevaCuenta((p) => ({ ...p, saldo_actual: e.target.value }))} placeholder="0.00" />
                </label>
                <button type="submit" className="col-span-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2.5 text-sm font-bold transition-all">
                  Guardar Cuenta
                </button>
              </form>
            )}

            {cuentas.length === 0 ? (
              <p className="text-center text-sm text-slate-400 py-8">Sin cuentas registradas. Agrega tu primera cuenta o medio de pago.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {cuentas.map((c) => {
                  const info = bancoInfo(c.banco);
                  return (
                    <div key={c.id} className="rounded-2xl border border-slate-200 p-4 bg-slate-50/50">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{info.emoji} {info.label}</span>
                        <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">{c.moneda}</span>
                      </div>
                      <p className="font-bold text-slate-800 mt-1">{c.alias}</p>
                      <p className="font-mono font-black text-xl text-slate-900 mt-1">
                        {c.moneda === "VES" ? "Bs." : "$"} {fmt(c.saldo_actual)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* MOVIMIENTOS */}
          <section className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4">
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
              <form onSubmit={crearMovimiento} className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <label className="flex flex-col">
                  <span className={labelCls}>Cuenta</span>
                  <select className={inputCls} value={nuevoMovimiento.cuenta_id} onChange={(e) => setNuevoMovimiento((p) => ({ ...p, cuenta_id: e.target.value }))}>
                    <option value="">Seleccionar...</option>
                    {cuentas.map((c) => (
                      <option key={c.id} value={c.id}>{bancoInfo(c.banco).emoji} {c.alias}</option>
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
                  <input type="number" step="0.01" className={inputCls} value={nuevoMovimiento.monto} onChange={(e) => setNuevoMovimiento((p) => ({ ...p, monto: e.target.value }))} placeholder="0.00" />
                </label>
                <label className="flex flex-col">
                  <span className={labelCls}>Concepto</span>
                  <input className={inputCls} value={nuevoMovimiento.concepto} onChange={(e) => setNuevoMovimiento((p) => ({ ...p, concepto: e.target.value }))} placeholder="Ej. Pago a proveedor" />
                </label>
                <button type="submit" className="col-span-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2.5 text-sm font-bold transition-all">
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
                        <p className="text-[11px] text-slate-400">{cuenta ? bancoInfo(cuenta.banco).label : `Cuenta #${m.cuenta_id}`} · {new Date(m.created_at).toLocaleDateString("es-VE")}</p>
                      </div>
                      <span className={`font-mono font-bold ${m.tipo === "ingreso" ? "text-emerald-600" : "text-rose-600"}`}>
                        {m.tipo === "ingreso" ? "+" : "−"}${fmt(m.monto)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* PANEL DE YHORGE */}
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
    </div>
  );
}
