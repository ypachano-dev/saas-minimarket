import { useState, useEffect } from "react";
import apiClient from "../api/client";

interface ItemCritico {
  id: string;
  nombre: string;
  proveedor: string;
  stock: number;
  minimo: number;
  velocidad_mes: number;
}

interface ItemVencer {
  id: string;
  nombre: string;
  dias: number;
  lote_plata: number;
  severidad: "danger" | "warning";
}

interface MetricaDepartamento {
  nombre: string;
  kilos_despachados: number;
  ventas_usd: number;
  merma_kilos: number;
  rendimiento: number;
  personal_comision: number;
}

const METRICAS_DEPARTAMENTOS_SEED: MetricaDepartamento[] = [
  { nombre: "🥩 Departamento de Carnicería", kilos_despachados: 840.50, ventas_usd: 5043.00, merma_kilos: 42.10, rendimiento: 95.2, personal_comision: 252.15 },
  { nombre: "🥦 Departamento de Verdulería", kilos_despachados: 1250.00, ventas_usd: 1875.00, merma_kilos: 85.30, rendimiento: 93.6, personal_comision: 93.75 }
];

const DETALLE_REPONER_SEED: ItemCritico[] = [
  { id: "P001", nombre: "Harina PAN 1kg", proveedor: "Distribuidora Polar", stock: 15, minimo: 50, velocidad_mes: 360 },
  { id: "P002", nombre: "Aceite Vatel 1L", proveedor: "Vatel C.A.", stock: 5, minimo: 20, velocidad_mes: 90 },
  { id: "P004", nombre: "Pasta Primor 500g", proveedor: "Alimentos Mary", stock: 10, minimo: 30, velocidad_mes: 210 },
];

const DETALLE_VENCER_SEED: ItemVencer[] = [
  { id: "P003", nombre: "Arroz Primor 1kg", dias: 12, lote_plata: 156.00, severidad: "danger" },
  { id: "P015", nombre: "Yogurt Mi Vaca 500g", dias: 4, lote_plata: 48.50, severidad: "danger" },
  { id: "P022", nombre: "Queso Paisa Rebanado", dias: 19, lote_plata: 210.00, severidad: "warning" },
];

const fmt = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function DashboardMaestro() {
  const [deptos, setDeptos] = useState<MetricaDepartamento[]>(METRICAS_DEPARTAMENTOS_SEED);
  const [reponerList, setReponerList] = useState<ItemCritico[]>(DETALLE_REPONER_SEED);
  const [vencerList, setVencerList] = useState<ItemVencer[]>(DETALLE_VENCER_SEED);
  const [origenDatos, setOrigenDatos] = useState<string>("Entorno Simulador IA 🤖 (Fidelidad Comercial)");

  useEffect(() => {
    async function cargarDatosDashboard() {
      try {
        const res = await apiClient.get("/api/v1/dashboard/avanzado");
        if (res.data) {
          if (res.data.deptos) setDeptos(res.data.deptos);
          if (res.data.reponer) setReponerList(res.data.reponer);
          if (res.data.vencer) setVencerList(res.data.vencer);
          setOrigenDatos("API Backend");
        }
      } catch {
        // Fallback demo automático de alta densidad de datos
        setOrigenDatos("Entorno Simulador IA 🤖 (Fidelidad Comercial)");
      }
    }
    cargarDatosDashboard();
  }, []);

  return (
    <div className="p-6 space-y-6">
      {/* Encabezado Principal */}
      <div className="rounded-3xl bg-slate-900 p-8 text-white border border-slate-800 shadow-xl flex justify-between items-center relative overflow-hidden">
        <div className="absolute right-0 top-0 text-9xl translate-x-10 translate-y-2 opacity-5 select-none pointer-events-none">📊</div>
        <div>
          <h2 className="text-3xl font-black tracking-tight">Centro de Analítica e Inventarios</h2>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-0.5">Auditoría en Caliente de Devoluciones, Rotación y Comisiones de Despacho</p>
        </div>
        <div className="flex flex-col items-end space-y-0.5 bg-slate-800 border border-slate-700 px-4 py-1.5 rounded-2xl font-medium">
          <span className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Canal de Datos</span>
          <span className="text-xs font-black uppercase text-blue-400">{origenDatos}</span>
        </div>
      </div>

      {/* ================= SECCIÓN: CARNICERÍA Y VERDULERÍA (CONTROL DE PESADOS) ================= */}
      <div className="space-y-3">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 px-1">📊 Balance Operativo de Rubros Pesados (Comisión por Despacho)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {deptos.map((d) => (
            <div key={d.nombre} className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm space-y-4 hover:shadow-md transition-all">
              <div className="flex justify-between items-center border-b border-slate-50 pb-3">
                <h4 className="text-lg font-black text-slate-900 tracking-tight">{d.nombre}</h4>
                <span className="font-mono text-xl font-black text-slate-900">${fmt(d.ventas_usd)}</span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs font-medium text-slate-600">
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100/60 space-y-0.5">
                  <p className="text-slate-400 uppercase font-bold text-[10px]">Volumen Despachado</p>
                  <p className="text-base font-black text-slate-800 font-mono">{fmt(d.kilos_despachados)} Kg</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100/60 space-y-0.5">
                  <p className="text-slate-400 uppercase font-bold text-[10px]">Mermas Totales (Desposte/Desecho)</p>
                  <p className="text-base font-black text-rose-600 font-mono">{fmt(d.merma_kilos)} Kg</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100/60 space-y-0.5">
                  <p className="text-slate-400 uppercase font-bold text-[10px]">Rendimiento de Canal / Neto</p>
                  <p className="text-base font-black text-emerald-600 font-mono">{d.rendimiento}%</p>
                </div>
                <div className="bg-blue-50/50 p-3 rounded-2xl border border-blue-100/60 space-y-0.5">
                  <p className="text-blue-500 uppercase font-black text-[10px] tracking-wider">Nómina Carniceros / Pesadores</p>
                  <p className="text-base font-black text-blue-700 font-mono">${fmt(d.personal_comision)} <span className="text-[10px] font-bold uppercase text-blue-400">Comis.</span></p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ================= SECCIÓN: DESGLOSE CRÍTICO DE INVENTARIOS EN VIVO ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* DETALLE COMPLETO: QUÉ SE NECESITA REPONER URGENTE */}
        <div className="rounded-3xl bg-white border border-slate-100 shadow-sm overflow-hidden flex flex-col justify-between">
          <div className="p-4 bg-slate-50 border-b border-slate-100">
            <h4 className="text-xs font-black uppercase text-slate-900 tracking-wider flex items-center gap-2">
              <span className="text-sm">📉</span> Auditoría de Quiebres: Alerta de Reorden Inminente
            </h4>
          </div>
          <div className="p-2 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-xs font-bold uppercase text-slate-400 border-b border-slate-50">
                  <th className="px-4 py-2">Producto Alerta</th>
                  <th className="px-4 py-2 text-center">Stock Actual</th>
                  <th className="px-4 py-2 text-center">Mínimo Req.</th>
                  <th className="px-4 py-2 text-right">Velocidad Mes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-slate-700 font-medium">
                {reponerList.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/40">
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900 text-xs">{item.nombre}</p>
                      <p className="text-[10px] font-mono text-slate-400">{item.proveedor}</p>
                    </td>
                    <td className="px-4 py-3 text-center font-mono font-black text-rose-600 bg-rose-50/30 rounded-xl">{item.stock} u.</td>
                    <td className="px-4 py-3 text-center font-mono text-slate-500">{item.minimo} u.</td>
                    <td className="px-4 py-3 text-right font-mono text-blue-600 font-bold">{item.velocidad_mes} u./mes</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-3 bg-slate-50/50 border-t border-slate-100 text-[11px] font-bold text-slate-400 text-center uppercase tracking-wider">
            🚨 Total {reponerList.length} SKU cruzados por debajo del stock mínimo de seguridad.
          </div>
        </div>

        {/* DETALLE COMPLETO: QUÉ LOTES ESTÁN PRÓXIMOS A VENCER */}
        <div className="rounded-3xl bg-white border border-slate-100 shadow-sm overflow-hidden flex flex-col justify-between">
          <div className="p-4 bg-slate-50 border-b border-slate-100">
            <h4 className="text-xs font-black uppercase text-slate-900 tracking-wider flex items-center gap-2">
              <span className="text-sm">⏳</span> Cronómetro de Vencimiento: Alerta de Pérdidas por FV
            </h4>
          </div>
          <div className="p-2 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-xs font-bold uppercase text-slate-400 border-b border-slate-50">
                  <th className="px-4 py-2">Lote / Producto</th>
                  <th className="px-4 py-2 text-center">Tiempo Restante</th>
                  <th className="px-4 py-2 text-right">Valor en Riesgo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-slate-700 font-medium">
                {vencerList.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/40">
                    <td className="px-4 py-3 font-bold text-slate-900 text-xs">{item.nombre}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2.5 py-1 rounded-xl text-[11px] font-black font-mono border ${item.severidad === "danger"
                          ? "bg-rose-50 text-rose-700 border-rose-100 animate-pulse"
                          : "bg-amber-50 text-amber-700 border-amber-100"
                        }`}>
                        Vence en {item.dias} días
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-black text-slate-900">${fmt(item.lote_plata)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-3 bg-slate-50/50 border-t border-slate-100 text-[11px] font-bold text-rose-600 text-center uppercase tracking-wider">
            ⚠️ Atención: Requiere aplicar descuento por taquilla para liquidar lotes críticos.
          </div>
        </div>

      </div>
    </div>
  );
}