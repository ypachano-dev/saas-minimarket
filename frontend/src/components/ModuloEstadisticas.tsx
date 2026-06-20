import { useState, useEffect } from "react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import apiClient from "../api/client";
import AgentPanel from "./AgentPanel";

interface VentaDiaria { fecha: string; monto_usd: number | string; }
interface ProductoTop { producto_id: number; nombre: string; cantidad_vendida: number | string; monto_usd: number | string; }
interface VentaDept { departamento: string; monto_usd: number | string; }

interface EstadisticasResumen {
  ventas_ultimos_30_dias: VentaDiaria[];
  top_productos: ProductoTop[];
  ventas_por_departamento: VentaDept[];
  ventas_mes_actual_usd: number | string;
  ventas_mes_anterior_usd: number | string;
  variacion_pct: number | null;
  mermas_mes_usd_equivalente: number | string;
  productos_stock_critico: number;
}

// Los campos Decimal del backend llegan como string en el JSON; Number() los normaliza.
const fmt = (n: number | string) => Number(n).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const COLORES_DEPT = ["#7c3aed", "#0ea5e9", "#f59e0b", "#10b981", "#ef4444", "#64748b"];

export default function ModuloEstadisticas() {
  const [datos, setDatos] = useState<EstadisticasResumen | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    apiClient.get<EstadisticasResumen>("/api/v1/estadisticas/resumen")
      .then((res) => setDatos(res.data))
      .catch(() => setDatos(null))
      .finally(() => setCargando(false));
  }, []);

  const ventasChart = (datos?.ventas_ultimos_30_dias ?? []).map((v) => ({
    fecha: new Date(v.fecha).toLocaleDateString("es-VE", { day: "2-digit", month: "short" }),
    monto: Number(v.monto_usd),
  }));

  const topChart = (datos?.top_productos ?? []).slice(0, 8).map((p) => ({
    nombre: p.nombre.length > 14 ? p.nombre.slice(0, 14) + "…" : p.nombre,
    monto: Number(p.monto_usd),
  }));

  const deptChart = (datos?.ventas_por_departamento ?? []).map((d) => ({
    nombre: d.departamento,
    monto: Number(d.monto_usd),
  }));

  const variacion = datos?.variacion_pct ?? null;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
        <h1 className="text-3xl font-black tracking-tight text-slate-900 flex items-center gap-2">📈 Estadísticas Avanzadas</h1>
        <p className="text-sm text-slate-500 font-medium mt-1">Tendencias de ventas, productos top y análisis con IA</p>
      </div>

      {cargando ? (
        <p className="text-center text-sm text-slate-400 py-10">Cargando estadísticas...</p>
      ) : !datos ? (
        <p className="text-center text-sm text-rose-500 py-10">No se pudieron cargar las estadísticas.</p>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ventas Mes Actual</p>
              <p className="text-xl font-black text-blue-700 font-mono">${fmt(datos.ventas_mes_actual_usd)}</p>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mes Anterior</p>
              <p className="text-xl font-black text-slate-600 font-mono">${fmt(datos.ventas_mes_anterior_usd)}</p>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Variación</p>
              <p className={`text-xl font-black font-mono ${variacion === null ? "text-slate-400" : variacion >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {variacion === null ? "N/D" : `${variacion >= 0 ? "+" : ""}${variacion.toFixed(1)}%`}
              </p>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-amber-100 shadow-sm">
              <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Stock Crítico</p>
              <p className="text-xl font-black text-amber-600 font-mono">{datos.productos_stock_critico}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* VENTAS ÚLTIMOS 30 DÍAS */}
              <section className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900 mb-4">📊 Ventas - Últimos 30 días</h3>
                {ventasChart.length === 0 ? (
                  <p className="text-center text-xs text-slate-400 py-10">Sin ventas registradas en este período.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={ventasChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="fecha" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: any) => [`$${fmt(v)}`, "Ventas"]} />
                      <Line type="monotone" dataKey="monto" stroke="#2563eb" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </section>

              {/* TOP PRODUCTOS */}
              <section className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900 mb-4">🏆 Top Productos (30 días)</h3>
                {topChart.length === 0 ? (
                  <p className="text-center text-xs text-slate-400 py-10">Sin datos suficientes todavía.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={topChart} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10 }} width={100} />
                      <Tooltip formatter={(v: any) => [`$${fmt(v)}`, "Vendido"]} />
                      <Bar dataKey="monto" fill="#7c3aed" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </section>

              {/* VENTAS POR DEPARTAMENTO */}
              <section className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900 mb-4">🏢 Ventas por Departamento (30 días)</h3>
                {deptChart.length === 0 ? (
                  <p className="text-center text-xs text-slate-400 py-10">Sin datos suficientes todavía.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={deptChart} dataKey="monto" nameKey="nombre" cx="50%" cy="50%" outerRadius={80} label={(entry: any) => entry.nombre}>
                        {deptChart.map((_, idx) => (
                          <Cell key={idx} fill={COLORES_DEPT[idx % COLORES_DEPT.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => [`$${fmt(v)}`, "Ventas"]} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </section>
            </div>

            {/* PANEL DE VALE */}
            <div className="lg:col-span-1">
              <AgentPanel
                nombre="VALE"
                rolDescripcion="Analítica y Decisiones"
                avatarEmoji="📊"
                colorTema="violet"
                apiPath="/api/v1/agentes/vale"
                saludoInicial="Hola, soy VALE 📊 Ya revisé tus números. Pregúntame lo que necesites o espera mi análisis inicial."
                placeholder="Ej. ¿Qué producto debería promocionar?"
                autoIniciar
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
