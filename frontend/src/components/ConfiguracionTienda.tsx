import { useEffect, useState } from "react";
import apiClient from "../api/client";
import TicketTermico, { TICKET_CONFIG_DEFAULT, type TicketConfigVM, type TamanoPapel } from "./TicketTermico";

const inputCls = "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const labelCls = "text-xs font-semibold uppercase tracking-wider text-slate-400";

const TAMANOS_PAPEL: { value: TamanoPapel; label: string }[] = [
  { value: "80mm", label: "80mm (estándar)" },
  { value: "57mm", label: "57mm (compacto)" },
];

const DATOS_PREVIEW = {
  facturaNum: 123456,
  fecha: new Date().toLocaleString("es-VE", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" }),
  clienteName: "Cliente de Ejemplo",
  clienteCedula: "V-12345678",
  metodoPago: "Efectivo $",
  lineas: [
    { label: "2x Harina PAN 1kg", monto: 4.5 },
    { label: "1x Aceite Vatel 1L", monto: 3.2 },
  ],
  totalUsd: 7.7,
  totalVes: 7.7 * 36.5,
  montoRecibido: 10,
  vuelto: 2.3,
};

interface EmpresaConfigLite {
  nombre_comercial: string;
  logo_url: string | null;
}

export default function ConfiguracionTienda() {
  const [empresa, setEmpresa] = useState<EmpresaConfigLite | null>(null);
  const [config, setConfig] = useState<TicketConfigVM>(TICKET_CONFIG_DEFAULT);
  const [agentes, setAgentes] = useState({
    agente_vale_activo: true,
    agente_vale_prompt: "",
    agente_vale_modelo: "claude-3-5-haiku-20241022",
    agente_vale_temperatura: 0.0,

    agente_yhorge_activo: true,
    agente_yhorge_prompt: "",
    agente_yhorge_modelo: "claude-3-5-haiku-20241022",
    agente_yhorge_temperatura: 0.0,

    agente_alo_activo: true,
    agente_alo_prompt: "",
    agente_alo_modelo: "claude-3-5-haiku-20241022",
    agente_alo_temperatura: 0.2,
  });
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [guardandoAgentes, setGuardandoAgentes] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [mensajeAgentes, setMensajeAgentes] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  useEffect(() => {
    let activo = true;
    apiClient.get("/api/v1/empresa/mi-config").then((res) => {
      if (!activo) return;
      const data = res.data;
      setEmpresa({ nombre_comercial: data.nombre_comercial, logo_url: data.logo_url ?? null });
      if (data.ticket_config) {
        setConfig({
          tamano_papel: data.ticket_config.tamano_papel,
          mostrar_logo: data.ticket_config.mostrar_logo,
          mostrar_rif: data.ticket_config.mostrar_rif,
          texto_cabecera: data.ticket_config.texto_cabecera ?? "",
          texto_pie: data.ticket_config.texto_pie ?? "",
          desglosar_impuestos: data.ticket_config.desglosar_impuestos,
        });
      }
      setAgentes({
        agente_vale_activo: data.agente_vale_activo,
        agente_vale_prompt: data.agente_vale_prompt ?? "",
        agente_vale_modelo: data.agente_vale_modelo ?? "claude-3-5-haiku-20241022",
        agente_vale_temperatura: data.agente_vale_temperatura ?? 0.0,

        agente_yhorge_activo: data.agente_yhorge_activo,
        agente_yhorge_prompt: data.agente_yhorge_prompt ?? "",
        agente_yhorge_modelo: data.agente_yhorge_modelo ?? "claude-3-5-haiku-20241022",
        agente_yhorge_temperatura: data.agente_yhorge_temperatura ?? 0.0,

        agente_alo_activo: data.agente_alo_activo,
        agente_alo_prompt: data.agente_alo_prompt ?? "",
        agente_alo_modelo: data.agente_alo_modelo ?? "claude-3-5-haiku-20241022",
        agente_alo_temperatura: data.agente_alo_temperatura ?? 0.2,
      });
      setCargando(false);
    }).catch(() => setCargando(false));
    return () => { activo = false; };
  }, []);

  function set<K extends keyof TicketConfigVM>(key: K, value: TicketConfigVM[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  function updateAgente<K extends keyof typeof agentes>(key: K, value: typeof agentes[K]) {
    setAgentes((prev) => ({ ...prev, [key]: value }));
  }

  async function guardar() {
    setGuardando(true);
    setMensaje(null);
    try {
      await apiClient.put("/api/v1/empresa/config-ticket", {
        tamano_papel: config.tamano_papel,
        mostrar_logo: config.mostrar_logo,
        mostrar_rif: config.mostrar_rif,
        texto_cabecera: config.texto_cabecera,
        texto_pie: config.texto_pie,
        desglosar_impuestos: config.desglosar_impuestos,
      });
      setMensaje({ tipo: "ok", texto: "Configuración de ticket guardada con éxito." });
    } catch (err: any) {
      setMensaje({ tipo: "error", texto: err?.response?.data?.detail || "No se pudo guardar la configuración." });
    } finally {
      setGuardando(false);
    }
  }

  async function guardarAgentes() {
    setGuardandoAgentes(true);
    setMensajeAgentes(null);
    try {
      await apiClient.put("/api/v1/empresa/config-agentes", agentes);
      setMensajeAgentes({ tipo: "ok", texto: "Ajustes de IA guardados con éxito." });
    } catch (err: any) {
      setMensajeAgentes({ tipo: "error", texto: err?.response?.data?.detail || "No se pudieron guardar los ajustes de las guías de IA." });
    } finally {
      setGuardandoAgentes(false);
    }
  }

  if (cargando) {
    return <div className="p-6 text-sm text-slate-400">Cargando configuración...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <header>
        <h2 className="text-3xl font-black tracking-tight text-slate-900">Configuración de Tienda</h2>
        <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Personalización de Ticket de Caja</p>
      </header>

      {mensaje && (
        <p className={`text-sm font-medium ${mensaje.tipo === "ok" ? "text-emerald-600" : "text-red-600"}`}>{mensaje.texto}</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* --- Panel de Controles --- */}
        <section className="rounded-3xl border border-slate-100/80 bg-white p-6 shadow-sm space-y-5">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">Personalización de Ticket de Caja</h3>

          <label className="flex flex-col">
            <span className={labelCls}>Tamaño de Papel</span>
            <select
              className={inputCls}
              value={config.tamano_papel}
              onChange={(e) => set("tamano_papel", e.target.value as TamanoPapel)}
            >
              {TAMANOS_PAPEL.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col">
            <span className={labelCls}>Texto de Cabecera (dirección, teléfono, etc.)</span>
            <textarea
              className={`${inputCls} resize-none`}
              rows={2}
              value={config.texto_cabecera}
              onChange={(e) => set("texto_cabecera", e.target.value)}
              placeholder="Av. Principal, Local 4 · Tel: 0414-1234567"
            />
          </label>

          <label className="flex flex-col">
            <span className={labelCls}>Texto de Pie de Página</span>
            <textarea
              className={`${inputCls} resize-none`}
              rows={2}
              value={config.texto_pie}
              onChange={(e) => set("texto_pie", e.target.value)}
              placeholder="No se aceptan devoluciones después de 3 días"
            />
          </label>

          <div className="grid grid-cols-1 gap-3">
            {([
              { key: "mostrar_logo" as const, label: "Mostrar Logo en el Ticket" },
              { key: "mostrar_rif" as const, label: "Mostrar RIF de la Empresa" },
              { key: "desglosar_impuestos" as const, label: "Desglosar Impuestos (IVA)" },
            ]).map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
                <span className="text-sm font-medium text-slate-700">{item.label}</span>
                <button
                  type="button"
                  onClick={() => set(item.key, !config[item.key])}
                  title={`${item.label}: ${config[item.key] ? "Activado" : "Desactivado"}`}
                  aria-label={`${item.label}: ${config[item.key] ? "Activado" : "Desactivado"}`}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300 ${
                    config[item.key] ? "bg-emerald-500" : "bg-slate-200"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-300 ${
                      config[item.key] ? "translate-x-5" : ""
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            className="w-full rounded-2xl bg-slate-900 py-3 text-sm font-bold text-white shadow-sm transition-all duration-300 hover:bg-slate-700 hover:shadow-md disabled:bg-slate-400"
          >
            {guardando ? "Guardando..." : "Guardar Configuración"}
          </button>
        </section>

        {/* --- Previsualización en Vivo --- */}
        <section className="rounded-3xl border border-slate-100/80 bg-slate-50 p-6 shadow-sm flex flex-col items-center">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 self-start mb-4">Previsualización en Vivo</h3>
          <TicketTermico
            config={config}
            datos={{
              nombreComercial: empresa?.nombre_comercial || "Mi Negocio",
              rif: "J-12345678-0",
              logoUrl: empresa?.logo_url,
              ...DATOS_PREVIEW,
            }}
          />
        </section>
      </div>

      {/* --- Ajustes Avanzados de Guías de IA --- */}
      <section className="rounded-3xl border border-slate-100/80 bg-white p-6 shadow-sm space-y-6">
        <div>
          <h3 className="text-lg font-black tracking-tight text-slate-900">Ajustes Avanzados de Guías de IA</h3>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Personaliza las respuestas, rapidez e inteligencia de cada guía</p>
        </div>

        {mensajeAgentes && (
          <p className={`text-sm font-medium ${mensajeAgentes.tipo === "ok" ? "text-emerald-600" : "text-red-600"}`}>{mensajeAgentes.texto}</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* --- AGENTE VALE --- */}
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">📊</span>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">VALE</h4>
                  <p className="text-[10px] text-slate-400 flex items-center gap-1">
                    Análisis y BI
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${agentes.agente_vale_activo ? "bg-emerald-500" : "bg-slate-300"}`} />
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => updateAgente("agente_vale_activo", !agentes.agente_vale_activo)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300 ${
                  agentes.agente_vale_activo ? "bg-emerald-500" : "bg-slate-200"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-300 ${
                    agentes.agente_vale_activo ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>

            {agentes.agente_vale_activo && (
              <div className="space-y-3 pt-2 border-t border-slate-200/60">
                <label className="flex flex-col">
                  <span className={labelCls}>Instrucciones del Sistema (Prompt)</span>
                  <textarea
                    className={`${inputCls} resize-none text-xs`}
                    rows={4}
                    value={agentes.agente_vale_prompt}
                    onChange={(e) => updateAgente("agente_vale_prompt", e.target.value)}
                    placeholder="Escribe instrucciones personalizadas (vacío para usar valor por defecto)..."
                  />
                </label>

                <label className="flex flex-col">
                  <span className={labelCls}>Rapidez / Inteligencia</span>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    value={agentes.agente_vale_modelo}
                    onChange={(e) => updateAgente("agente_vale_modelo", e.target.value)}
                  >
                    <option value="claude-3-5-haiku-20241022">Rápido (Claude 3.5 Haiku)</option>
                    <option value="claude-3-5-sonnet-20241022">Inteligente (Claude 3.5 Sonnet)</option>
                  </select>
                </label>

                <div className="flex flex-col">
                  <span className={labelCls}>Creatividad (Temperatura: {agentes.agente_vale_temperatura})</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    className="w-full mt-2 cursor-pointer accent-slate-900"
                    value={agentes.agente_vale_temperatura}
                    onChange={(e) => updateAgente("agente_vale_temperatura", parseFloat(e.target.value))}
                  />
                  <div className="flex justify-between text-[9px] text-slate-400 mt-1">
                    <span>Preciso/Lógico</span>
                    <span>Creativo</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* --- AGENTE YHORGE --- */}
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🧮</span>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">YHORGE</h4>
                  <p className="text-[10px] text-slate-400 flex items-center gap-1">
                    Cobranza y Finanzas
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${agentes.agente_yhorge_activo ? "bg-emerald-500" : "bg-slate-300"}`} />
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => updateAgente("agente_yhorge_activo", !agentes.agente_yhorge_activo)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300 ${
                  agentes.agente_yhorge_activo ? "bg-emerald-500" : "bg-slate-200"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-300 ${
                    agentes.agente_yhorge_activo ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>

            {agentes.agente_yhorge_activo && (
              <div className="space-y-3 pt-2 border-t border-slate-200/60">
                <label className="flex flex-col">
                  <span className={labelCls}>Instrucciones del Sistema (Prompt)</span>
                  <textarea
                    className={`${inputCls} resize-none text-xs`}
                    rows={4}
                    value={agentes.agente_yhorge_prompt}
                    onChange={(e) => updateAgente("agente_yhorge_prompt", e.target.value)}
                    placeholder="Escribe instrucciones personalizadas (vacío para usar valor por defecto)..."
                  />
                </label>

                <label className="flex flex-col">
                  <span className={labelCls}>Rapidez / Inteligencia</span>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    value={agentes.agente_yhorge_modelo}
                    onChange={(e) => updateAgente("agente_yhorge_modelo", e.target.value)}
                  >
                    <option value="claude-3-5-haiku-20241022">Rápido (Claude 3.5 Haiku)</option>
                    <option value="claude-3-5-sonnet-20241022">Inteligente (Claude 3.5 Sonnet)</option>
                  </select>
                </label>

                <div className="flex flex-col">
                  <span className={labelCls}>Creatividad (Temperatura: {agentes.agente_yhorge_temperatura})</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    className="w-full mt-2 cursor-pointer accent-slate-900"
                    value={agentes.agente_yhorge_temperatura}
                    onChange={(e) => updateAgente("agente_yhorge_temperatura", parseFloat(e.target.value))}
                  />
                  <div className="flex justify-between text-[9px] text-slate-400 mt-1">
                    <span>Preciso/Lógico</span>
                    <span>Creativo</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* --- AGENTE ALO --- */}
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">✨</span>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">ALO</h4>
                  <p className="text-[10px] text-slate-400 flex items-center gap-1">
                    Ventas y Marketing
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${agentes.agente_alo_activo ? "bg-emerald-500" : "bg-slate-300"}`} />
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => updateAgente("agente_alo_activo", !agentes.agente_alo_activo)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300 ${
                  agentes.agente_alo_activo ? "bg-emerald-500" : "bg-slate-200"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-300 ${
                    agentes.agente_alo_activo ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>

            {agentes.agente_alo_activo && (
              <div className="space-y-3 pt-2 border-t border-slate-200/60">
                <label className="flex flex-col">
                  <span className={labelCls}>Instrucciones del Sistema (Prompt)</span>
                  <textarea
                    className={`${inputCls} resize-none text-xs`}
                    rows={4}
                    value={agentes.agente_alo_prompt}
                    onChange={(e) => updateAgente("agente_alo_prompt", e.target.value)}
                    placeholder="Escribe instrucciones personalizadas (vacío para usar valor por defecto)..."
                  />
                </label>

                <label className="flex flex-col">
                  <span className={labelCls}>Rapidez / Inteligencia</span>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    value={agentes.agente_alo_modelo}
                    onChange={(e) => updateAgente("agente_alo_modelo", e.target.value)}
                  >
                    <option value="claude-3-5-haiku-20241022">Rápido (Claude 3.5 Haiku)</option>
                    <option value="claude-3-5-sonnet-20241022">Inteligente (Claude 3.5 Sonnet)</option>
                  </select>
                </label>

                <div className="flex flex-col">
                  <span className={labelCls}>Creatividad (Temperatura: {agentes.agente_alo_temperatura})</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    className="w-full mt-2 cursor-pointer accent-slate-900"
                    value={agentes.agente_alo_temperatura}
                    onChange={(e) => updateAgente("agente_alo_temperatura", parseFloat(e.target.value))}
                  />
                  <div className="flex justify-between text-[9px] text-slate-400 mt-1">
                    <span>Preciso/Lógico</span>
                    <span>Creativo</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={guardarAgentes}
            disabled={guardandoAgentes}
            className="rounded-2xl bg-slate-900 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition-all duration-300 hover:bg-slate-700 hover:shadow-md disabled:bg-slate-400"
          >
            {guardandoAgentes ? "Guardando Ajustes..." : "Guardar Ajustes de IA"}
          </button>
        </div>
      </section>
    </div>
  );
}
