import { useState, useEffect, type FormEvent } from "react";
import apiClient from "../api/client";
import AgentPanel from "./AgentPanel";

interface Cliente { id: number; nombre: string; cedula: string; limite_credito: number; }
interface Proveedor { id: number; nombre: string; rif: string; }

// Mini-form inline para crear proveedor rápido
function QuickAddProveedor({ onCreado }: { onCreado: (p: Proveedor) => void }) {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState("");
  const [rif, setRif] = useState("");
  const [err, setErr] = useState("");

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setErr("");
    if (!nombre.trim()) { setErr("El nombre es obligatorio."); return; }
    try {
      const res = await apiClient.post<Proveedor>("/api/v1/proveedores", { nombre: nombre.trim(), rif: rif.trim() || "S/R" });
      onCreado(res.data);
      setNombre(""); setRif(""); setOpen(false);
    } catch (ex: any) {
      setErr(ex.response?.data?.detail ?? "No se pudo crear el proveedor.");
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1 text-xs text-blue-600 hover:underline font-semibold">
        + Crear proveedor rápido
      </button>
    );
  }
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

// Mini-form inline para crear cliente rápido
function QuickAddCliente({ onCreado }: { onCreado: (c: Cliente) => void }) {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState("");
  const [cedula, setCedula] = useState("");
  const [err, setErr] = useState("");

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setErr("");
    if (!nombre.trim()) { setErr("El nombre es obligatorio."); return; }
    try {
      const res = await apiClient.post<Cliente>("/api/v1/clientes", { nombre: nombre.trim(), cedula: cedula.trim() || "S/C", limite_credito: 0 });
      onCreado(res.data);
      setNombre(""); setCedula(""); setOpen(false);
    } catch (ex: any) {
      setErr(ex.response?.data?.detail ?? "No se pudo crear el cliente.");
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1 text-xs text-blue-600 hover:underline font-semibold">
        + Crear cliente rápido
      </button>
    );
  }
  return (
    <div className="mt-2 p-3 bg-blue-50 border border-blue-100 rounded-xl space-y-2">
      <p className="text-xs font-bold text-blue-700">Nuevo Cliente</p>
      {err && <p className="text-xs text-rose-600">{err}</p>}
      <input className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre *" />
      <input className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" value={cedula} onChange={(e) => setCedula(e.target.value)} placeholder="Cédula (opcional)" />
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className="flex-1 text-xs bg-white border border-slate-200 rounded-lg py-1.5 font-semibold">Cancelar</button>
        <button type="button" onClick={guardar} className="flex-1 text-xs bg-blue-600 text-white rounded-lg py-1.5 font-semibold">Guardar</button>
      </div>
    </div>
  );
}

interface CxC {
  id: number; cliente_id: number; cliente_nombre: string;
  monto_total: number; monto_abonado: number; saldo: number;
  fecha_emision: string; fecha_vencimiento: string; status: string; notas: string | null;
}

interface CxP {
  id: number; proveedor_id: number; proveedor_nombre: string;
  monto_total: number; monto_abonado: number; saldo: number;
  fecha_emision: string; fecha_vencimiento: string; status: string; notas: string | null;
}

interface ResumenCartera {
  total_por_cobrar: number; total_por_cobrar_vencido: number; cuentas_por_cobrar_vencidas: number;
  total_por_pagar: number; total_por_pagar_vencido: number; cuentas_por_pagar_vencidas: number;
}

type Tab = "cxc" | "cxp";

const inputCls = "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const labelCls = "text-xs font-semibold uppercase tracking-wider text-slate-400";
// Los campos Decimal del backend llegan como string en el JSON (ej. "50000.00"); Number()
// los normaliza antes de formatear, igual que el resto de los módulos de este proyecto.
const fmt = (n: number | string) => Number(n).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function estaVencida(fechaVencimiento: string, status: string): boolean {
  if (status === "pagada") return false;
  return new Date(fechaVencimiento) < new Date(new Date().toDateString());
}

const statusBadge: Record<string, string> = {
  pendiente: "bg-amber-50 text-amber-700",
  parcial: "bg-blue-50 text-blue-700",
  pagada: "bg-emerald-50 text-emerald-700",
};

export default function ModuloCartera() {
  const [tab, setTab] = useState<Tab>("cxc");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [cxcs, setCxcs] = useState<CxC[]>([]);
  const [cxps, setCxps] = useState<CxP[]>([]);
  const [resumen, setResumen] = useState<ResumenCartera | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [abonando, setAbonando] = useState<{ tipo: Tab; id: number } | null>(null);
  const [montoAbono, setMontoAbono] = useState("");

  const [formCxc, setFormCxc] = useState({ cliente_id: "", monto_total: "", fecha_vencimiento: "", notas: "" });
  const [formCxp, setFormCxp] = useState({ proveedor_id: "", monto_total: "", fecha_vencimiento: "", notas: "" });

  function cargarTodo() {
    apiClient.get<Cliente[]>("/api/v1/clientes").then((res) => setClientes(res.data)).catch(() => {});
    apiClient.get<Proveedor[]>("/api/v1/proveedores").then((res) => setProveedores(res.data)).catch(() => {});
    apiClient.get<CxC[]>("/api/v1/cartera/cxc").then((res) => setCxcs(res.data)).catch(() => {});
    apiClient.get<CxP[]>("/api/v1/cartera/cxp").then((res) => setCxps(res.data)).catch(() => {});
    apiClient.get<ResumenCartera>("/api/v1/cartera/resumen").then((res) => setResumen(res.data)).catch(() => {});
  }

  useEffect(() => { cargarTodo(); }, []);

  async function crearCxc(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!formCxc.cliente_id || !formCxc.monto_total || !formCxc.fecha_vencimiento) {
      setMsg({ tipo: "error", texto: "Cliente, monto y fecha de vencimiento son obligatorios." });
      return;
    }
    try {
      await apiClient.post("/api/v1/cartera/cxc", {
        cliente_id: Number(formCxc.cliente_id),
        monto_total: Number(formCxc.monto_total),
        fecha_vencimiento: formCxc.fecha_vencimiento,
        notas: formCxc.notas.trim() || undefined,
      });
      setFormCxc({ cliente_id: "", monto_total: "", fecha_vencimiento: "", notas: "" });
      setMostrarForm(false);
      setMsg({ tipo: "ok", texto: "Cuenta por cobrar registrada." });
      cargarTodo();
    } catch (err: any) {
      setMsg({ tipo: "error", texto: err.response?.data?.detail ?? "No se pudo registrar la cuenta." });
    }
  }

  async function crearCxp(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!formCxp.proveedor_id || !formCxp.monto_total || !formCxp.fecha_vencimiento) {
      setMsg({ tipo: "error", texto: "Proveedor, monto y fecha de vencimiento son obligatorios." });
      return;
    }
    try {
      await apiClient.post("/api/v1/cartera/cxp", {
        proveedor_id: Number(formCxp.proveedor_id),
        monto_total: Number(formCxp.monto_total),
        fecha_vencimiento: formCxp.fecha_vencimiento,
        notas: formCxp.notas.trim() || undefined,
      });
      setFormCxp({ proveedor_id: "", monto_total: "", fecha_vencimiento: "", notas: "" });
      setMostrarForm(false);
      setMsg({ tipo: "ok", texto: "Cuenta por pagar registrada." });
      cargarTodo();
    } catch (err: any) {
      setMsg({ tipo: "error", texto: err.response?.data?.detail ?? "No se pudo registrar la cuenta." });
    }
  }

  async function registrarAbono() {
    if (!abonando || !montoAbono) return;
    try {
      const path = abonando.tipo === "cxc" ? `/api/v1/cartera/cxc/${abonando.id}/abono` : `/api/v1/cartera/cxp/${abonando.id}/abono`;
      await apiClient.post(path, { monto: Number(montoAbono) });
      setAbonando(null);
      setMontoAbono("");
      setMsg({ tipo: "ok", texto: "Abono registrado con éxito." });
      cargarTodo();
    } catch (err: any) {
      setMsg({ tipo: "error", texto: err.response?.data?.detail ?? "No se pudo registrar el abono." });
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
        <h1 className="text-3xl font-black tracking-tight text-slate-900 flex items-center gap-2">💸 Cartera y Créditos</h1>
        <p className="text-sm text-slate-500 font-medium mt-1">Cuentas por cobrar (fiado) y cuentas por pagar a proveedores</p>
      </div>

      {resumen && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Por Cobrar</p>
            <p className="text-xl font-black text-blue-700 font-mono">${fmt(resumen.total_por_cobrar)}</p>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-rose-100 shadow-sm">
            <p className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">Vencido (CxC)</p>
            <p className="text-xl font-black text-rose-600 font-mono">${fmt(resumen.total_por_cobrar_vencido)}</p>
            <p className="text-[10px] text-slate-400">{resumen.cuentas_por_cobrar_vencidas} cuenta(s)</p>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Por Pagar</p>
            <p className="text-xl font-black text-violet-700 font-mono">${fmt(resumen.total_por_pagar)}</p>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-rose-100 shadow-sm">
            <p className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">Vencido (CxP)</p>
            <p className="text-xl font-black text-rose-600 font-mono">${fmt(resumen.total_por_pagar_vencido)}</p>
            <p className="text-[10px] text-slate-400">{resumen.cuentas_por_pagar_vencidas} cuenta(s)</p>
          </div>
        </div>
      )}

      {msg && (
        <p className={`text-sm font-medium px-4 py-2 rounded-xl ${msg.tipo === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
          {msg.texto}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setTab("cxc"); setMostrarForm(false); }}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors duration-300 ${tab === "cxc" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
              >
                👤 Cuentas por Cobrar (Clientes)
              </button>
              <button
                type="button"
                onClick={() => { setTab("cxp"); setMostrarForm(false); }}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors duration-300 ${tab === "cxp" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
              >
                🚚 Cuentas por Pagar (Proveedores)
              </button>
            </div>
            <button
              type="button"
              onClick={() => setMostrarForm((v) => !v)}
              className="bg-slate-950 hover:bg-blue-600 text-white rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all"
            >
              {mostrarForm ? "Cancelar" : "+ Nueva Cuenta"}
            </button>
          </div>

          {mostrarForm && tab === "cxc" && (
            <form onSubmit={crearCxc} className="grid grid-cols-2 gap-3 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex flex-col col-span-2">
                <label className="flex flex-col">
                  <span className={labelCls}>Cliente</span>
                  <select className={inputCls} value={formCxc.cliente_id} onChange={(e) => setFormCxc((p) => ({ ...p, cliente_id: e.target.value }))}>
                    <option value="">Seleccionar...</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>{c.nombre} ({c.cedula}) {c.limite_credito > 0 ? `· Límite: $${fmt(c.limite_credito)}` : ""}</option>
                    ))}
                  </select>
                </label>
                <QuickAddCliente onCreado={(c) => { setClientes((prev) => [...prev, c]); setFormCxc((p) => ({ ...p, cliente_id: String(c.id) })); }} />
              </div>
              <label className="flex flex-col">
                <span className={labelCls}>Monto ($)</span>
                <input type="number" step="0.01" className={inputCls} value={formCxc.monto_total} onChange={(e) => setFormCxc((p) => ({ ...p, monto_total: e.target.value }))} placeholder="0.00" />
              </label>
              <label className="flex flex-col">
                <span className={labelCls}>Fecha de Vencimiento</span>
                <input type="date" className={inputCls} value={formCxc.fecha_vencimiento} onChange={(e) => setFormCxc((p) => ({ ...p, fecha_vencimiento: e.target.value }))} />
              </label>
              <label className="flex flex-col col-span-2">
                <span className={labelCls}>Notas</span>
                <input className={inputCls} value={formCxc.notas} onChange={(e) => setFormCxc((p) => ({ ...p, notas: e.target.value }))} placeholder="Ej. Fiado de la quincena" />
              </label>
              <button type="submit" className="col-span-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2.5 text-sm font-bold transition-all">
                Guardar Cuenta por Cobrar
              </button>
            </form>
          )}

          {mostrarForm && tab === "cxp" && (
            <form onSubmit={crearCxp} className="grid grid-cols-2 gap-3 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex flex-col col-span-2">
                <label className="flex flex-col">
                  <span className={labelCls}>Proveedor</span>
                  <select className={inputCls} value={formCxp.proveedor_id} onChange={(e) => setFormCxp((p) => ({ ...p, proveedor_id: e.target.value }))}>
                    <option value="">Seleccionar...</option>
                    {proveedores.map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre} ({p.rif})</option>
                    ))}
                  </select>
                </label>
                <QuickAddProveedor onCreado={(p) => { setProveedores((prev) => [...prev, p]); setFormCxp((f) => ({ ...f, proveedor_id: String(p.id) })); }} />
              </div>
              <label className="flex flex-col">
                <span className={labelCls}>Monto ($)</span>
                <input type="number" step="0.01" className={inputCls} value={formCxp.monto_total} onChange={(e) => setFormCxp((p) => ({ ...p, monto_total: e.target.value }))} placeholder="0.00" />
              </label>
              <label className="flex flex-col">
                <span className={labelCls}>Fecha de Vencimiento</span>
                <input type="date" className={inputCls} value={formCxp.fecha_vencimiento} onChange={(e) => setFormCxp((p) => ({ ...p, fecha_vencimiento: e.target.value }))} />
              </label>
              <label className="flex flex-col col-span-2">
                <span className={labelCls}>Notas</span>
                <input className={inputCls} value={formCxp.notas} onChange={(e) => setFormCxp((p) => ({ ...p, notas: e.target.value }))} placeholder="Ej. Compra de inventario" />
              </label>
              <button type="submit" className="col-span-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl py-2.5 text-sm font-bold transition-all">
                Guardar Cuenta por Pagar
              </button>
            </form>
          )}

          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            {tab === "cxc" ? (
              cxcs.length === 0 ? (
                <p className="text-center text-sm text-slate-400 py-10">Sin cuentas por cobrar registradas.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left bg-slate-50/50">
                      <th className={`py-2.5 px-4 ${labelCls}`}>Cliente</th>
                      <th className={`py-2.5 px-4 ${labelCls}`}>Saldo</th>
                      <th className={`py-2.5 px-4 ${labelCls}`}>Vence</th>
                      <th className={`py-2.5 px-4 ${labelCls}`}>Estado</th>
                      <th className={`py-2.5 px-4 ${labelCls}`}><span className="sr-only">Acción</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cxcs.map((c) => {
                      const vencida = estaVencida(c.fecha_vencimiento, c.status);
                      return (
                        <tr key={c.id} className={vencida ? "bg-rose-50/40" : ""}>
                          <td className="py-3 px-4 font-medium text-slate-700">{c.cliente_nombre}</td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-800">${fmt(c.saldo)}</td>
                          <td className={`py-3 px-4 ${vencida ? "text-rose-600 font-bold" : "text-slate-500"}`}>
                            {new Date(c.fecha_vencimiento).toLocaleDateString("es-VE")} {vencida && "⚠️"}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusBadge[c.status] ?? "bg-slate-100 text-slate-600"}`}>{c.status}</span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            {c.status !== "pagada" && (
                              <button
                                type="button"
                                onClick={() => { setAbonando({ tipo: "cxc", id: c.id }); setMontoAbono(""); }}
                                className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1 rounded-lg"
                              >
                                Abonar
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )
            ) : (
              cxps.length === 0 ? (
                <p className="text-center text-sm text-slate-400 py-10">Sin cuentas por pagar registradas.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left bg-slate-50/50">
                      <th className={`py-2.5 px-4 ${labelCls}`}>Proveedor</th>
                      <th className={`py-2.5 px-4 ${labelCls}`}>Saldo</th>
                      <th className={`py-2.5 px-4 ${labelCls}`}>Vence</th>
                      <th className={`py-2.5 px-4 ${labelCls}`}>Estado</th>
                      <th className={`py-2.5 px-4 ${labelCls}`}><span className="sr-only">Acción</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cxps.map((c) => {
                      const vencida = estaVencida(c.fecha_vencimiento, c.status);
                      return (
                        <tr key={c.id} className={vencida ? "bg-rose-50/40" : ""}>
                          <td className="py-3 px-4 font-medium text-slate-700">{c.proveedor_nombre}</td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-800">${fmt(c.saldo)}</td>
                          <td className={`py-3 px-4 ${vencida ? "text-rose-600 font-bold" : "text-slate-500"}`}>
                            {new Date(c.fecha_vencimiento).toLocaleDateString("es-VE")} {vencida && "⚠️"}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusBadge[c.status] ?? "bg-slate-100 text-slate-600"}`}>{c.status}</span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            {c.status !== "pagada" && (
                              <button
                                type="button"
                                onClick={() => { setAbonando({ tipo: "cxp", id: c.id }); setMontoAbono(""); }}
                                className="text-xs font-bold text-violet-600 hover:text-violet-700 bg-violet-50 px-3 py-1 rounded-lg"
                              >
                                Abonar
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )
            )}
          </div>
        </div>

        {/* PANEL DE YHORGE (Cobranza) */}
        <div className="lg:col-span-1">
          <AgentPanel
            nombre="YHORGE"
            rolDescripcion="Cobranza y Negociación"
            avatarEmoji="🧮"
            colorTema="emerald"
            apiPath="/api/v1/agentes/yhorge"
            saludoInicial="Hola, soy YHORGE 🧮 Reviso tu cartera y te digo a quién cobrarle primero y qué decirle. ¿Empezamos?"
            placeholder="Ej. Redáctame un mensaje de cobro"
            autoIniciar
          />
        </div>
      </div>

      {/* MODAL DE ABONO */}
      {abonando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Registrar Abono</h3>
            <label className="flex flex-col">
              <span className={labelCls}>Monto del Abono ($)</span>
              <input type="number" step="0.01" className={inputCls} value={montoAbono} onChange={(e) => setMontoAbono(e.target.value)} placeholder="0.00" autoFocus />
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setAbonando(null)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl py-2.5 text-sm font-bold transition-all">
                Cancelar
              </button>
              <button type="button" onClick={registrarAbono} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-2.5 text-sm font-bold transition-all">
                Confirmar Abono
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
