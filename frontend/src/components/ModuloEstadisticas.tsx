import { useState, useEffect } from "react";
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
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

const TOOLTIP_DARK = {
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.25)",
  background: "rgba(15,23,42,0.95)",
  color: "#e2e8f0",
  boxShadow: "0 20px 40px -15px rgba(0,0,0,0.6)",
};

// --- Iconos vectoriales estilizados (sin emojis) ---
const IconTrendUp = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 17l6-6 4 4 8-8" />
    <path d="M15 7h6v6" />
  </svg>
);
const IconHistory = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
const IconPulse = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12h4l2 6 4-12 2 6h6" />
  </svg>
);
const IconAlert = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 9v4" />
    <path d="M10.3 3.9 2.6 17.5A1.8 1.8 0 0 0 4.2 20h15.6a1.8 1.8 0 0 0 1.6-2.5L13.7 3.9a1.8 1.8 0 0 0-3.4 0Z" />
    <path d="M12 16.2h.01" />
  </svg>
);

function Sparkline({ data, color }: { data: { v: number }[]; color: string }) {
  if (data.length < 2) return <div className="h-10" />;
  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={data}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function Badge({ texto, tono }: { texto: string; tono: "emerald" | "rose" | "amber" | "slate" }) {
  const tonos = {
    emerald: "bg-emerald-500/15 text-emerald-400 border border-emerald-400/20",
    rose: "bg-rose-500/15 text-rose-400 border border-rose-400/20 shadow-[0_0_14px_rgba(244,63,94,0.35)]",
    amber: "bg-amber-500/15 text-amber-400 border border-amber-400/20 shadow-[0_0_14px_rgba(245,158,11,0.35)]",
    slate: "bg-slate-500/15 text-slate-400 border border-slate-400/20",
  };
  return (
    <span className={`shrink-0 text-[11px] font-bold px-2 py-1 rounded-lg whitespace-nowrap ${tonos[tono]}`}>
      {texto}
    </span>
  );
}

function KpiCard({
  icono, iconoBg, etiqueta, valor, valorClase, sparkline, sparklineColor, glowClase, borderClase, badge,
}: {
  icono: React.ReactNode;
  iconoBg: string;
  etiqueta: string;
  valor: React.ReactNode;
  valorClase?: string;
  sparkline?: { v: number }[];
  sparklineColor?: string;
  glowClase?: string;
  borderClase?: string;
  badge?: { texto: string; tono: "emerald" | "rose" | "amber" | "slate" };
}) {
  return (
    <div
      className={`relative glass-card-dark rounded-2xl p-4 shadow-2xl border ${borderClase ?? "border-white/10"} ${glowClase ?? ""} overflow-hidden flex flex-col justify-between min-h-[112px]`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">{etiqueta}</p>
        <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-lg ${iconoBg}`}>
          {icono}
        </div>
      </div>

      {sparkline && (
        <div className="-mx-1 opacity-90">
          <Sparkline data={sparkline} color={sparklineColor ?? "#60a5fa"} />
        </div>
      )}

      <div className="flex items-end justify-between gap-2 mt-1">
        <p className={`text-2xl font-black font-mono leading-none ${valorClase ?? "text-slate-100"}`}>{valor}</p>
        {badge && <Badge texto={badge.texto} tono={badge.tono} />}
      </div>
    </div>
  );
}

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

  // Aproximación visual: la ventana de 30 días no calza exacto con el mes calendario,
  // pero sirve como tendencia decorativa dentro de cada tarjeta KPI.
  const mitad = Math.ceil(ventasChart.length / 2);
  const sparkAnterior = ventasChart.slice(0, mitad).map((v) => ({ v: v.monto }));
  const sparkActual = ventasChart.slice(mitad).map((v) => ({ v: v.monto }));

  const topChart = (datos?.top_productos ?? []).slice(0, 8).map((p) => ({
    nombre: p.nombre.length > 14 ? p.nombre.slice(0, 14) + "…" : p.nombre,
    monto: Number(p.monto_usd),
  }));

  const deptChart = (datos?.ventas_por_departamento ?? []).map((d) => ({
    nombre: d.departamento,
    monto: Number(d.monto_usd),
  }));
  const totalDept = deptChart.reduce((acc, d) => acc + d.monto, 0);

  const variacion = datos?.variacion_pct ?? null;
  const stockCritico = datos?.productos_stock_critico ?? 0;

  return (
    <div className="relative min-h-full bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 isolate">
      {/* Blobs decorativos de fondo, persistentes en todo el módulo */}
      <div className="absolute top-0 right-0 w-[28rem] h-[28rem] bg-violet-600/20 rounded-full blur-[100px]" />
      <div className="absolute top-[40%] -left-32 w-[24rem] h-[24rem] bg-blue-600/15 rounded-full blur-[100px]" />
      <div className="absolute bottom-0 left-1/3 w-[26rem] h-[26rem] bg-fuchsia-600/10 rounded-full blur-[110px]" />

      <div className="relative p-6 max-w-7xl mx-auto space-y-6">
        <div className="relative rounded-3xl p-6 overflow-hidden shadow-2xl bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-violet-950/60 border border-white/10 backdrop-blur-md">
          <div className="absolute -top-16 -right-16 w-56 h-56 bg-violet-600/30 rounded-full blur-3xl" />
          <div className="absolute -bottom-20 left-1/3 w-56 h-56 bg-blue-600/20 rounded-full blur-3xl" />
          <div className="relative">
            <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-2">
              <span className="bg-gradient-to-br from-violet-400 to-blue-400 bg-clip-text text-transparent">Estadísticas Avanzadas</span>
            </h1>
            <p className="text-sm text-slate-400 font-medium mt-1">Tendencias de ventas, productos top y análisis con IA</p>
          </div>
        </div>

        {cargando ? (
          <p className="text-center text-sm text-slate-400 py-10">Cargando estadísticas...</p>
        ) : !datos ? (
          <p className="text-center text-sm text-rose-400 py-10">No se pudieron cargar las estadísticas.</p>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard
                etiqueta="Ventas Mes Actual"
                valor={`$${fmt(datos.ventas_mes_actual_usd)}`}
                valorClase="text-blue-400"
                icono={<IconTrendUp />}
                iconoBg="bg-gradient-to-br from-blue-500 to-indigo-600"
                sparkline={sparkActual}
                sparklineColor="#60a5fa"
                badge={variacion === null ? undefined : { texto: `${variacion >= 0 ? "+" : ""}${variacion.toFixed(1)}%`, tono: variacion >= 0 ? "emerald" : "rose" }}
              />
              <KpiCard
                etiqueta="Mes Anterior"
                valor={`$${fmt(datos.ventas_mes_anterior_usd)}`}
                valorClase="text-slate-300"
                icono={<IconHistory />}
                iconoBg="bg-gradient-to-br from-slate-500 to-slate-700"
                sparkline={sparkAnterior}
                sparklineColor="#94a3b8"
                badge={{ texto: "REF", tono: "slate" }}
              />
              <KpiCard
                etiqueta="Variación"
                valor={variacion === null ? "N/D" : `${variacion >= 0 ? "+" : ""}${variacion.toFixed(1)}%`}
                valorClase={variacion === null ? "text-slate-400" : variacion >= 0 ? "text-emerald-400" : "text-rose-400"}
                icono={<IconPulse />}
                iconoBg={variacion !== null && variacion < 0 ? "bg-gradient-to-br from-rose-500 to-red-600" : "bg-gradient-to-br from-emerald-500 to-teal-600"}
                glowClase={variacion !== null && variacion >= 0 ? "glow-pulse-emerald" : ""}
                borderClase={variacion !== null && variacion >= 0 ? "border-emerald-400/30" : "border-rose-400/30"}
                badge={variacion === null ? undefined : { texto: variacion >= 0 ? "AL ALZA" : "A LA BAJA", tono: variacion >= 0 ? "emerald" : "rose" }}
              />
              <KpiCard
                etiqueta="Stock Crítico"
                valor={stockCritico}
                valorClase="text-amber-400"
                icono={<IconAlert />}
                iconoBg="bg-gradient-to-br from-amber-500 to-red-600"
                glowClase={stockCritico > 0 ? "glow-pulse-amber" : ""}
                borderClase="border-amber-400/30"
                badge={stockCritico > 0 ? { texto: "CRÍTICO", tono: "rose" } : { texto: "OK", tono: "emerald" }}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                {/* VENTAS ÚLTIMOS 30 DÍAS */}
                <section className="glass-card-dark rounded-3xl p-6 shadow-2xl border border-white/10">
                  <h3 className="text-sm font-bold text-slate-100 mb-4">Ventas · Últimos 30 días</h3>
                  {ventasChart.length === 0 ? (
                    <p className="text-center text-xs text-slate-400 py-10">Sin ventas registradas en este período.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={240}>
                      <AreaChart data={ventasChart}>
                        <defs>
                          <linearGradient id="ventasGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.55} />
                            <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 6" stroke="#475569" vertical={false} opacity={0.35} />
                        <XAxis dataKey="fecha" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(v: any) => [`$${fmt(v)}`, "Ventas"]} contentStyle={TOOLTIP_DARK} />
                        <Area type="monotone" dataKey="monto" stroke="#60a5fa" strokeWidth={2.5} fill="url(#ventasGradient)" dot={false} activeDot={{ r: 4, fill: "#60a5fa", stroke: "#0f172a", strokeWidth: 2 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </section>

                {/* TOP PRODUCTOS */}
                <section className="glass-card-dark rounded-xl p-6 shadow-2xl border border-white/10">
                  <h3 className="text-sm font-bold text-slate-100 mb-4">Top Productos (30 días)</h3>
                  {topChart.length === 0 ? (
                    <p className="text-center text-xs text-slate-400 py-10">Sin datos suficientes todavía.</p>
                  ) : (
                    <div className="[&_.recharts-bar-rectangle]:drop-shadow-[0_6px_16px_rgba(139,92,246,0.55)]">
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={topChart} layout="vertical" margin={{ left: 20 }}>
                          <defs>
                            <linearGradient id="topGradient" x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor="#8b5cf6" />
                              <stop offset="60%" stopColor="#6d4ee0" />
                              <stop offset="100%" stopColor="#4f46e5" />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#64748b" horizontal={false} opacity={0.12} />
                          <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                          <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10, fill: "#cbd5e1" }} width={100} axisLine={false} tickLine={false} />
                          <Tooltip formatter={(v: any) => [`$${fmt(v)}`, "Vendido"]} contentStyle={TOOLTIP_DARK} cursor={{ fill: "rgba(139,92,246,0.08)" }} />
                          <Bar dataKey="monto" fill="url(#topGradient)" radius={[0, 10, 10, 0]} maxBarSize={28} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </section>

                {/* VENTAS POR DEPARTAMENTO — barras de progreso horizontales (sin pie/donut) */}
                <section className="glass-card-dark rounded-xl p-6 shadow-2xl border border-white/10">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-sm font-bold text-slate-100">Ventas por Departamento (30 días)</h3>
                    <p className="text-xs font-mono font-bold text-slate-400">Total ${fmt(totalDept)}</p>
                  </div>
                  {deptChart.length === 0 ? (
                    <p className="text-center text-xs text-slate-400 py-10">Sin datos suficientes todavía.</p>
                  ) : (
                    <div className="space-y-4">
                      {deptChart
                        .slice()
                        .sort((a, b) => b.monto - a.monto)
                        .map((d) => {
                          const pct = totalDept > 0 ? (d.monto / totalDept) * 100 : 0;
                          return (
                            <div key={d.nombre}>
                              <div className="flex items-baseline justify-between gap-3 mb-1.5">
                                <p className="text-sm font-semibold text-slate-200 truncate">{d.nombre}</p>
                                <p className="text-xs font-mono text-slate-400 shrink-0">
                                  ${fmt(d.monto)} <span className="text-slate-500">· {pct.toFixed(1)}%</span>
                                </p>
                              </div>
                              <div className="h-2 rounded-full bg-slate-800/70 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 shadow-[0_0_10px_rgba(34,211,238,0.5)]"
                                  style={{ width: `${Math.max(pct, 2)}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                    </div>
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
    </div>
  );
}
