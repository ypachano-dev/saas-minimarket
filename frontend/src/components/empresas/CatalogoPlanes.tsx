import { useEffect, useState } from "react";
import apiClient from "../../api/client";
import { MODULOS_ERP, AGENTES_IA, type AgenteIAKey } from "./MatrizModulosAgentes";

export interface PlanCatalogo {
  id: number;
  nombre: string;
  precio_mensual: number;
  limite_usuarios: number;
  modulos: Record<string, boolean>;
  agente_vale_incluido: boolean;
  agente_yhorge_incluido: boolean;
  agente_alo_incluido: boolean;
}

const inputCls = "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/50";
const labelCls = "text-xs font-semibold uppercase tracking-wider text-slate-400";

function planAAgentesIA(plan: PlanCatalogo): Record<AgenteIAKey, boolean> {
  return {
    vale: plan.agente_vale_incluido,
    yhorge: plan.agente_yhorge_incluido,
    alo: plan.agente_alo_incluido,
  };
}

interface PlanCardProps {
  plan: PlanCatalogo;
  onGuardado: (plan: PlanCatalogo) => void;
}

function PlanCard({ plan, onGuardado }: PlanCardProps) {
  const [precio, setPrecio] = useState(String(plan.precio_mensual));
  const [limite, setLimite] = useState(String(plan.limite_usuarios));
  const [modulos, setModulos] = useState<Record<string, boolean>>(plan.modulos);
  const [agentesIA, setAgentesIA] = useState<Record<AgenteIAKey, boolean>>(planAAgentesIA(plan));
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  const activeModulos = MODULOS_ERP.filter(m => modulos[m.key]);
  const inactiveModulos = MODULOS_ERP.filter(m => !modulos[m.key]);

  const activeAgentes = AGENTES_IA.filter(a => agentesIA[a.key]);
  const inactiveAgentes = AGENTES_IA.filter(a => !agentesIA[a.key]);

  function addModulo(key: string) {
    setModulos(prev => ({ ...prev, [key]: true }));
  }

  function removeModulo(key: string) {
    setModulos(prev => ({ ...prev, [key]: false }));
  }

  function addAgente(key: AgenteIAKey) {
    setAgentesIA(prev => ({ ...prev, [key]: true }));
  }

  function removeAgente(key: AgenteIAKey) {
    setAgentesIA(prev => ({ ...prev, [key]: false }));
  }

  async function guardar() {
    setGuardando(true);
    setMensaje("");
    try {
      const { data } = await apiClient.put(`/api/v1/planes/${plan.id}`, {
        precio_mensual: Number(precio),
        limite_usuarios: Number(limite),
        modulos,
        agente_vale_incluido: agentesIA.vale,
        agente_yhorge_incluido: agentesIA.yhorge,
        agente_alo_incluido: agentesIA.alo,
      });
      onGuardado(data);
      setMensaje("Plan actualizado.");
      setTimeout(() => setMensaje(""), 3000);
    } catch {
      setMensaje("No se pudo guardar el plan.");
    }
    setGuardando(false);
  }

  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between space-y-4">
      <div className="space-y-4">
        <h3 className="text-lg font-black tracking-tight text-slate-900">{plan.nombre}</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col">
            <span className={labelCls}>Precio Mensual ($)</span>
            <input type="number" step="0.01" min="0" className={inputCls} value={precio} onChange={(e) => setPrecio(e.target.value)} />
          </label>
          <label className="flex flex-col">
            <span className={labelCls}>Límite de Usuarios</span>
            <input type="number" step="1" min="1" className={inputCls} value={limite} onChange={(e) => setLimite(e.target.value)} />
          </label>
        </div>

        {/* Módulos Compact Select */}
        <div className="space-y-1.5">
          <span className={labelCls}>Módulos Autorizados</span>
          <div className="flex flex-wrap gap-1 max-h-[110px] overflow-y-auto p-1.5 border border-slate-100 rounded-xl bg-slate-50/50">
            {activeModulos.length === 0 && <span className="text-xs text-slate-400 p-0.5">Ninguno</span>}
            {activeModulos.map(m => (
              <span key={m.key} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-100">
                {m.label.split(" (")[0]}
                <button type="button" onClick={() => removeModulo(m.key)} className="text-emerald-500 hover:text-emerald-950 font-bold ml-0.5">✕</button>
              </span>
            ))}
          </div>
          {inactiveModulos.length > 0 && (
            <select
              className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              value=""
              onChange={(e) => {
                if (e.target.value) addModulo(e.target.value);
              }}
            >
              <option value="" disabled>+ Añadir módulo...</option>
              {inactiveModulos.map(m => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
          )}
        </div>

        {/* Agentes Compact Select */}
        <div className="space-y-1.5">
          <span className={labelCls}>Guías de IA</span>
          <div className="flex flex-wrap gap-1 p-1.5 border border-slate-100 rounded-xl bg-slate-50/50">
            {activeAgentes.length === 0 && <span className="text-xs text-slate-400 p-0.5">Ninguno</span>}
            {activeAgentes.map(a => (
              <span key={a.key} className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700 border border-purple-100">
                {a.label.split(" (")[0]}
                <button type="button" onClick={() => removeAgente(a.key)} className="text-purple-500 hover:text-purple-950 font-bold ml-0.5">✕</button>
              </span>
            ))}
          </div>
          {inactiveAgentes.length > 0 && (
            <select
              className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              value=""
              onChange={(e) => {
                if (e.target.value) addAgente(e.target.value as AgenteIAKey);
              }}
            >
              <option value="" disabled>+ Añadir agente...</option>
              {inactiveAgentes.map(a => (
                <option key={a.key} value={a.key}>{a.label}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="pt-2">
        {mensaje && <p className="text-xs font-semibold text-emerald-600 mb-2">{mensaje}</p>}
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="w-full rounded-2xl bg-slate-900 py-2.5 text-sm font-bold text-white transition-all duration-300 hover:bg-slate-700 disabled:bg-slate-400 shadow-sm"
        >
          {guardando ? "Guardando..." : "Guardar Cambios"}
        </button>
      </div>
    </div>
  );
}

export default function CatalogoPlanes() {
  const [planes, setPlanes] = useState<PlanCatalogo[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    apiClient
      .get<PlanCatalogo[]>("/api/v1/planes")
      .then(({ data }) => setPlanes(data))
      .finally(() => setCargando(false));
  }, []);

  function onGuardado(actualizado: PlanCatalogo) {
    setPlanes((prev) => prev.map((p) => (p.id === actualizado.id ? actualizado : p)));
  }

  if (cargando) {
    return <p className="text-sm text-slate-400">Cargando catálogo de planes...</p>;
  }

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-black tracking-tight text-slate-900">Catálogo de Planes</h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {planes.map((plan) => (
          <PlanCard key={plan.id} plan={plan} onGuardado={onGuardado} />
        ))}
      </div>
    </section>
  );
}
