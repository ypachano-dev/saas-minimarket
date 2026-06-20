import { useState, useEffect } from "react";
import apiClient from "../api/client";

interface StockProyectado {
  producto_id: number;
  codigo_interno: string;
  nombre: string;
  stock_actual: number;
  velocidad_diaria: number;
  dias_restantes: number | null;
  fecha_agotamiento_estimada: string | null;
  alerta: "critico" | "atencion" | "ok";
  sugerencia_reorden: number;
}

const fmtKg = (n: number | string) => Number(n).toLocaleString("es-VE", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

const ALERTA_BADGE: Record<string, string> = {
  critico: "bg-rose-50 text-rose-700 border-rose-100",
  atencion: "bg-amber-50 text-amber-700 border-amber-100",
  ok: "bg-emerald-50 text-emerald-700 border-emerald-100",
};

const ALERTA_LABEL: Record<string, string> = {
  critico: "🔴 Crítico",
  atencion: "🟡 Atención",
  ok: "🟢 OK",
};

export default function AlmacenProyeccion() {
  const [datos, setDatos] = useState<StockProyectado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [soloAlertas, setSoloAlertas] = useState(false);

  useEffect(() => {
    apiClient.get<StockProyectado[]>("/api/v1/almacen/proyeccion")
      .then((res) => setDatos(res.data))
      .catch(() => setDatos([]))
      .finally(() => setCargando(false));
  }, []);

  const filtrados = soloAlertas ? datos.filter((d) => d.alerta !== "ok") : datos;

  return (
    <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900">📦 Stock Actual y Proyectado</h3>
          <p className="text-xs text-slate-400 mt-0.5">Basado en la velocidad de venta real de los últimos 30 días</p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none bg-slate-50 border border-slate-100 px-3 py-2 rounded-xl text-xs font-bold text-slate-600">
          <input type="checkbox" checked={soloAlertas} onChange={(e) => setSoloAlertas(e.target.checked)} className="rounded text-blue-600 focus:ring-blue-500" />
          Solo mostrar alertas
        </label>
      </div>

      {cargando ? (
        <p className="text-center text-sm text-slate-400 py-10">Calculando proyección...</p>
      ) : filtrados.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-10">Sin productos para mostrar.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left bg-slate-50/50">
              <th className="py-2 px-3 text-xs font-bold text-slate-400 uppercase">Producto</th>
              <th className="py-2 px-3 text-xs font-bold text-slate-400 uppercase">Stock Actual</th>
              <th className="py-2 px-3 text-xs font-bold text-slate-400 uppercase">Venta Diaria</th>
              <th className="py-2 px-3 text-xs font-bold text-slate-400 uppercase">Días Restantes</th>
              <th className="py-2 px-3 text-xs font-bold text-slate-400 uppercase">Se Agota</th>
              <th className="py-2 px-3 text-xs font-bold text-slate-400 uppercase">Alerta</th>
              <th className="py-2 px-3 text-xs font-bold text-slate-400 uppercase">Sugerencia Reorden</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtrados.map((d) => (
              <tr key={d.producto_id} className={d.alerta === "critico" ? "bg-rose-50/30" : ""}>
                <td className="py-2.5 px-3">
                  <span className="font-medium text-slate-700 block">{d.nombre}</span>
                  <span className="text-[10px] text-slate-400 font-mono">{d.codigo_interno}</span>
                </td>
                <td className="py-2.5 px-3 font-mono text-slate-700">{fmtKg(d.stock_actual)}</td>
                <td className="py-2.5 px-3 font-mono text-slate-500">{fmtKg(d.velocidad_diaria)}/día</td>
                <td className="py-2.5 px-3 font-mono text-slate-700">{d.dias_restantes !== null ? `${d.dias_restantes} días` : "—"}</td>
                <td className="py-2.5 px-3 text-slate-500">{d.fecha_agotamiento_estimada ? new Date(d.fecha_agotamiento_estimada).toLocaleDateString("es-VE") : "—"}</td>
                <td className="py-2.5 px-3">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${ALERTA_BADGE[d.alerta]}`}>
                    {ALERTA_LABEL[d.alerta]}
                  </span>
                </td>
                <td className="py-2.5 px-3 font-mono font-bold text-blue-600">
                  {Number(d.sugerencia_reorden) > 0 ? fmtKg(d.sugerencia_reorden) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
