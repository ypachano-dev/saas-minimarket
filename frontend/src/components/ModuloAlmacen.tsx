import { useState } from "react";
import CatalogoProductos from "./CatalogoProductos";
import AlmacenIngreso from "./AlmacenIngreso";
import AlmacenAuditorias from "./AlmacenAuditorias";
import AlmacenProyeccion from "./AlmacenProyeccion";
import ModuloDesposte from "./ModuloDesposte";

type Tab = "catalogo" | "ingreso" | "auditorias" | "proyeccion" | "desposte";

const TABS: { key: Tab; label: string }[] = [
  { key: "catalogo", label: "📦 Catálogo" },
  { key: "ingreso", label: "📥 Ingreso de Mercancía" },
  { key: "auditorias", label: "🔍 Auditorías" },
  { key: "proyeccion", label: "📈 Stock Proyectado" },
  { key: "desposte", label: "🥩 Desposte" },
];

export default function ModuloAlmacen({ tasaBcv }: { tasaBcv: number }) {
  const [tab, setTab] = useState<Tab>("catalogo");

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
        <h1 className="text-3xl font-black tracking-tight text-slate-900 flex items-center gap-2">🏢 Gestión Almacén</h1>
        <p className="text-sm text-slate-500 font-medium mt-1">Catálogo, ingreso de mercancía, auditorías, stock proyectado y desposte</p>
      </div>

      <div className="flex flex-wrap gap-2 bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors duration-300 ${
              tab === t.key ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-500 hover:bg-slate-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === "catalogo" && <CatalogoProductos tasaBcv={tasaBcv} />}
        {tab === "ingreso" && <AlmacenIngreso />}
        {tab === "auditorias" && <AlmacenAuditorias />}
        {tab === "proyeccion" && <AlmacenProyeccion />}
        {tab === "desposte" && <ModuloDesposte />}
      </div>
    </div>
  );
}
