import { useEffect, useState } from "react";
import apiClient from "../../api/client";
import MatrizModulosAgentes, { type AgenteIAKey } from "./MatrizModulosAgentes";

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

const inputCls = "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
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

  function toggleModulo(key: string) {
    setModulos((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleAgenteIA(key: AgenteIAKey) {
    setAgentesIA((prev) => ({ ...prev, [key]: !prev[key] }));
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
    } catch {
      setMensaje("No se pudo guardar el plan.");
    }
    setGuardando(false);
  }

  return (
    <div className="rounded-3xl border border-slate-100/80 bg-white p-6 shadow-sm space-y-4">
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
      <MatrizModulosAgentes
        modulos={modulos}
        onToggleModulo={toggleModulo}
        agentesIA={agentesIA}
        onToggleAgenteIA={toggleAgenteIA}
      />
      {mensaje && <p className="text-sm font-medium text-slate-600">{mensaje}</p>}
      <button
        type="button"
        onClick={guardar}
        disabled={guardando}
        className="w-full rounded-2xl bg-slate-900 py-2.5 text-sm font-bold text-white transition-all duration-300 hover:bg-slate-700 disabled:bg-slate-400"
      >
        {guardando ? "Guardando..." : "Guardar Cambios del Plan"}
      </button>
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
