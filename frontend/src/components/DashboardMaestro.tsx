import { useState, useEffect, useCallback } from "react";
import { GoogleMap, Marker } from "@react-google-maps/api";
import apiClient from "../api/client";
import { useGoogleMaps, TIENE_GOOGLE_MAPS_KEY } from "../hooks/useGoogleMaps";
import { CENTRO_POR_DEFECTO } from "../lib/geo";
import { primerDiaMesActual, hoyISO } from "../lib/fechas";
import SelectorRangoFechas from "./SelectorRangoFechas";
import PanelGastosFijos from "./PanelGastosFijos";

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
  linea: string;
  nombre: string;
  kilos_despachados: number;
  ventas_usd: number;
  merma_kilos: number;
  rendimiento: number;
  personal_comision: number;
}

const METRICAS_MINIMARKET: MetricaDepartamento[] = [
  { linea: "Carnicería", nombre: "🥩 Departamento de Carnicería", kilos_despachados: 840.50, ventas_usd: 5043.00, merma_kilos: 42.10, rendimiento: 95.2, personal_comision: 252.15 },
  { linea: "Verdulería", nombre: "🥦 Departamento de Verdulería", kilos_despachados: 1250.00, ventas_usd: 1875.00, merma_kilos: 85.30, rendimiento: 93.6, personal_comision: 93.75 },
  { linea: "Víveres", nombre: "🍞 Departamento de Víveres", kilos_despachados: 3120.00, ventas_usd: 6240.00, merma_kilos: 12.00, rendimiento: 99.6, personal_comision: 187.20 },
  { linea: "Farmacia", nombre: "💊 Departamento de Farmacia / Medicinas", kilos_despachados: 150.20, ventas_usd: 2250.00, merma_kilos: 1.50, rendimiento: 99.0, personal_comision: 112.50 },
];

const METRICAS_AGROFERRETERIA: MetricaDepartamento[] = [
  { linea: "Ferretería", nombre: "🛠️ Departamento de Ferretería", kilos_despachados: 1980.00, ventas_usd: 5940.00, merma_kilos: 5.00, rendimiento: 99.9, personal_comision: 297.00 },
  { linea: "Agroinsumos", nombre: "🌱 Departamento de Agroinsumos", kilos_despachados: 4500.00, ventas_usd: 9000.00, merma_kilos: 90.00, rendimiento: 98.0, personal_comision: 450.00 },
  { linea: "Maquinaria", nombre: "🚜 Departamento de Maquinaria", kilos_despachados: 850.00, ventas_usd: 17000.00, merma_kilos: 0.00, rendimiento: 100.0, personal_comision: 850.00 },
];

const DETALLE_REPONER_SEED: ItemCritico[] = [
  { id: "P001", nombre: "Harina PAN 1kg", proveedor: "Distribuidora Polar", stock: 15, minimo: 50, velocidad_mes: 360 },
  { id: "P002", nombre: "Aceite Vatel 1L", proveedor: "Vatel C.A.", stock: 5, minimo: 20, velocidad_mes: 90 },
  { id: "P004", nombre: "Pasta Primor 500g", proveedor: "Alimentos Mary", stock: 10, minimo: 30, velocidad_mes: 210 },
  { id: "P005", nombre: "Arroz Mary Dorado 1kg", proveedor: "Alimentos Mary", stock: 8, minimo: 40, velocidad_mes: 180 },
  { id: "P006", nombre: "Leche Polvo La Campiña", proveedor: "Distribuidora Polar", stock: 3, minimo: 15, velocidad_mes: 45 },
  { id: "P007", nombre: "Café Fama de América 500g", proveedor: "Proveedor Local", stock: 2, minimo: 25, velocidad_mes: 120 },
  { id: "P008", nombre: "Azúcar Montalbán 1kg", proveedor: "Distribuidora Polar", stock: 12, minimo: 60, velocidad_mes: 240 },
];

const DETALLE_VENCER_SEED: ItemVencer[] = [
  { id: "P003", nombre: "Arroz Primor 1kg", dias: 12, lote_plata: 156.00, severidad: "danger" },
  { id: "P015", nombre: "Yogurt Mi Vaca 500g", dias: 4, lote_plata: 48.50, severidad: "danger" },
  { id: "P022", nombre: "Queso Paisa Rebanado", dias: 19, lote_plata: 210.00, severidad: "warning" },
  { id: "P030", nombre: "Jamón de Pavo Plumrose", dias: 6, lote_plata: 180.00, severidad: "danger" },
  { id: "P031", nombre: "Margarina Mavesa 500g", dias: 15, lote_plata: 95.00, severidad: "warning" },
  { id: "P032", nombre: "Salchichas Oscar Mayer", dias: 2, lote_plata: 120.00, severidad: "danger" },
  { id: "P033", nombre: "Crema de Leche El Prado", dias: 8, lote_plata: 65.00, severidad: "danger" },
];

const fmt = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface VendedorUbicacion {
  id: number;
  nombre: string;
  email: string;
  lat: number | null;
  lng: number | null;
  ubicacion_actualizada_en: string | null;
}

interface ActividadRtc {
  tipo: "visita" | "orden" | "avance_ruta";
  fecha: string;
  vendedor_id: number;
  vendedor_nombre: string;
  cliente_id: number | null;
  cliente_nombre: string | null;
  descripcion: string;
  monto_usd: string | number | null;
}

const ICONO_ACTIVIDAD: Record<ActividadRtc["tipo"], string> = {
  visita: "🚗",
  orden: "📝",
  avance_ruta: "🗺️",
};

const MAP_CONTAINER_STYLE: React.CSSProperties = { width: "100%", height: "100%", borderRadius: "0.75rem" };
const INTERVALO_REFRESCO_RTC_MS = 15000;

function tiempoRelativo(fechaIso: string): string {
  const minutos = Math.max(0, Math.round((Date.now() - new Date(fechaIso).getTime()) / 60000));
  if (minutos < 1) return "ahora mismo";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  return `hace ${Math.round(horas / 24)} d`;
}

export default function DashboardMaestro({ tipoNegocio, rol }: { tipoNegocio?: string; rol?: string | null }) {
  const isAgro = tipoNegocio === "agroferreteria";
  const defaultDeptos = isAgro ? METRICAS_AGROFERRETERIA : METRICAS_MINIMARKET;

  const [deptos, setDeptos] = useState<MetricaDepartamento[]>(defaultDeptos);
  const [reponerList, setReponerList] = useState<ItemCritico[]>(DETALLE_REPONER_SEED);
  const [vencerList, setVencerList] = useState<ItemVencer[]>(DETALLE_VENCER_SEED);
  const [origenDatos, setOrigenDatos] = useState<string>("Entorno Simulador IA 🤖 (Fidelidad Comercial)");

  // Rango de fechas global del balance por rubros (default: mes en curso)
  const [rangoDesde, setRangoDesde] = useState(primerDiaMesActual());
  const [rangoHasta, setRangoHasta] = useState(hoyISO());

  // Drill-down: rubro seleccionado al hacer clic en una tarjeta de departamento
  const [rubroSeleccionado, setRubroSeleccionado] = useState<MetricaDepartamento | null>(null);
  const [detalleRubro, setDetalleRubro] = useState<any | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [rangoDetalleDesde, setRangoDetalleDesde] = useState(primerDiaMesActual());
  const [rangoDetalleHasta, setRangoDetalleHasta] = useState(hoyISO());

  const { isLoaded } = useGoogleMaps();
  const [ubicaciones, setUbicaciones] = useState<VendedorUbicacion[]>([]);
  const [ubicacionesDisponible, setUbicacionesDisponible] = useState(true);
  const [actividad, setActividad] = useState<ActividadRtc[]>([]);

  useEffect(() => {
    async function cargarDatosDashboard() {
      try {
        const res = await apiClient.get("/api/v1/dashboard/avanzado", { params: { desde: rangoDesde, hasta: rangoHasta } });
        if (res.data) {
          if (res.data.deptos && res.data.deptos.length > 0) {
            setDeptos(res.data.deptos);
          } else {
            setDeptos(defaultDeptos);
          }
          if (res.data.reponer) setReponerList(res.data.reponer);
          if (res.data.vencer) setVencerList(res.data.vencer);
          setOrigenDatos("API Backend");
        }
      } catch {
        setDeptos(defaultDeptos);
        setOrigenDatos("Entorno Simulador IA 🤖 (Fidelidad Comercial)");
      }
    }
    cargarDatosDashboard();
  }, [tipoNegocio, defaultDeptos, rangoDesde, rangoHasta]);

  function abrirDetalleRubro(d: MetricaDepartamento) {
    setRubroSeleccionado(d);
    setRangoDetalleDesde(rangoDesde);
    setRangoDetalleHasta(rangoHasta);
  }

  useEffect(() => {
    if (!rubroSeleccionado) {
      setDetalleRubro(null);
      return;
    }
    let vigente = true;
    setCargandoDetalle(true);
    apiClient.get("/api/v1/dashboard/rubro-detalle", {
      params: { rubro: rubroSeleccionado.linea, desde: rangoDetalleDesde, hasta: rangoDetalleHasta },
    })
      .then((res) => { if (vigente) setDetalleRubro(res.data); })
      .catch(() => { if (vigente) setDetalleRubro(null); })
      .finally(() => { if (vigente) setCargandoDetalle(false); });
    return () => { vigente = false; };
  }, [rubroSeleccionado, rangoDetalleDesde, rangoDetalleHasta]);

  const cargarUbicaciones = useCallback(() => {
    if (rol !== "admin" && rol !== "propietario") return;
    apiClient.get<VendedorUbicacion[]>("/api/v1/usuarios/vendedores/ubicaciones")
      .then((res) => setUbicaciones(res.data))
      .catch(() => setUbicacionesDisponible(false));
  }, [rol]);

  const cargarActividad = useCallback(() => {
    apiClient.get<ActividadRtc[]>("/api/v1/dashboard/actividad-rtc", { params: { horas: 24 } })
      .then((res) => setActividad(res.data))
      .catch(() => setActividad([]));
  }, []);

  useEffect(() => {
    cargarUbicaciones();
    cargarActividad();
    const t = setInterval(() => {
      cargarUbicaciones();
      cargarActividad();
    }, INTERVALO_REFRESCO_RTC_MS);
    return () => clearInterval(t);
  }, [cargarUbicaciones, cargarActividad]);

  const vendedoresUbicados = ubicaciones.filter((v) => v.lat != null && v.lng != null);
  const esGerencia = rol === "admin" || rol === "propietario";
  const ventaPreventaHoy = actividad
    .filter((a) => a.tipo === "orden" && a.monto_usd != null)
    .reduce((acc, a) => acc + Number(a.monto_usd), 0);

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

      {/* ================= SECCIÓN: DEPARTAMENTOS DINÁMICOS ================= */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
            📊 Balance Operativo de Rubros ({isAgro ? "Agroferretería" : "MiniMarket"})
          </h3>
          <SelectorRangoFechas desde={rangoDesde} hasta={rangoHasta} onChange={(d, h) => { setRangoDesde(d); setRangoHasta(h); }} />
        </div>
        <p className="text-[10px] text-slate-400 px-1 -mt-1">Toca una tarjeta para ver el detalle: mejor producto por cantidad, por monto y mejor cliente.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {deptos.map((d) => (
            <div
              key={d.nombre}
              onClick={() => abrirDetalleRubro(d)}
              className="rounded-3xl border border-slate-100/80 bg-white p-6 shadow-sm space-y-4 hover:shadow-md hover:ring-2 hover:ring-blue-400/40 transition-all flex flex-col justify-between cursor-pointer"
            >
              <div className="flex justify-between items-center border-b border-slate-50 pb-3">
                <h4 className="text-sm font-black text-slate-900 tracking-tight truncate" title={d.nombre}>{d.nombre}</h4>
                <span className="font-mono text-sm font-black text-slate-900">${fmt(d.ventas_usd)}</span>
              </div>

              <div className="grid grid-cols-1 gap-2 text-xs font-medium text-slate-600">
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100/60 flex justify-between items-center">
                  <span className="text-slate-400 uppercase font-bold text-[9px]">Despachado</span>
                  <span className="font-mono font-black text-slate-800">{fmt(d.kilos_despachados)} Kg</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100/60 flex justify-between items-center">
                  <span className="text-slate-400 uppercase font-bold text-[9px]">Mermas</span>
                  <span className="font-mono font-black text-rose-600">{fmt(d.merma_kilos)} Kg</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100/60 flex justify-between items-center">
                  <span className="text-slate-400 uppercase font-bold text-[9px]">Rendimiento</span>
                  <span className="font-mono font-black text-emerald-600">{d.rendimiento}%</span>
                </div>
                <div className="bg-blue-50/50 p-2.5 rounded-xl border border-blue-100/60 flex justify-between items-center">
                  <span className="text-blue-500 uppercase font-black text-[9px]">Nómina/Comis.</span>
                  <span className="font-mono font-black text-blue-700">${fmt(d.personal_comision)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ================= SECCIÓN: GASTOS FIJOS DEL NEGOCIO (solo gerencia: misma data sensible que Cartera/Tesorería) ================= */}
      {esGerencia && <PanelGastosFijos />}

      {/* ================= SECCIÓN: RTC EN TIEMPO REAL (MAPA + FEED DE ACTIVIDAD) ================= */}
      <div className="space-y-3">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 px-1">🛰️ Fuerza de Ventas (RTC) en Tiempo Real</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Mapa de ubicaciones de vendedores */}
          <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm hover:shadow-md transition-all flex flex-col h-80">
            <div className="flex justify-between items-center px-1 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">📍</span>
                <h4 className="text-sm font-black text-slate-900 tracking-tight">Ubicación de Vendedores</h4>
              </div>
              {esGerencia && <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />}
            </div>

            {!esGerencia ? (
              <div className="flex-1 flex items-center justify-center text-center text-[11px] font-medium text-slate-400 px-6">
                Mapa de ubicación disponible para roles de gerencia (admin/propietario).
              </div>
            ) : !ubicacionesDisponible ? (
              <div className="flex-1 flex items-center justify-center text-center text-[11px] font-medium text-slate-400 px-6">
                No fue posible cargar las ubicaciones de los vendedores.
              </div>
            ) : !TIENE_GOOGLE_MAPS_KEY ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-[11px] font-medium text-amber-700">
                  🔑 Configura <code className="font-mono">VITE_GOOGLE_MAPS_API_KEY</code> para ver el mapa real.
                </span>
                <span className="text-[10px] font-bold text-slate-500">{vendedoresUbicados.length} vendedor(es) reportando GPS actualmente.</span>
              </div>
            ) : isLoaded ? (
              <div className="flex-1 rounded-2xl overflow-hidden">
                <GoogleMap mapContainerStyle={MAP_CONTAINER_STYLE} center={CENTRO_POR_DEFECTO} zoom={11}>
                  {vendedoresUbicados.map((v) => (
                    <Marker
                      key={v.id}
                      position={{ lat: v.lat as number, lng: v.lng as number }}
                      label={{ text: "🚗", fontSize: "16px" }}
                      title={`${v.nombre}${v.ubicacion_actualizada_en ? " · " + tiempoRelativo(v.ubicacion_actualizada_en) : ""}`}
                    />
                  ))}
                </GoogleMap>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-[11px] text-slate-400">Cargando mapa…</div>
            )}

            {esGerencia && ubicacionesDisponible && (
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center pt-2">
                {vendedoresUbicados.length} de {ubicaciones.length} vendedor(es) con GPS activo
              </p>
            )}
          </div>

          {/* Feed de actividad en vivo */}
          <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm hover:shadow-md transition-all flex flex-col h-80">
            <div className="flex justify-between items-center px-1 pb-2 border-b border-slate-50">
              <div className="flex items-center gap-2">
                <span className="text-lg">⚡</span>
                <h4 className="text-sm font-black text-slate-900 tracking-tight">Actividad RTC (últimas 24h)</h4>
              </div>
              <span className="text-[10px] font-bold text-blue-600">${fmt(ventaPreventaHoy)} en pedidos/presupuestos</span>
            </div>
            <div className="flex-1 overflow-y-auto pt-2 space-y-2 scrollbar-thin scrollbar-thumb-slate-200">
              {actividad.length === 0 && (
                <p className="text-center text-[11px] text-slate-400 py-10 font-medium">Sin actividad de vendedores en las últimas 24 horas.</p>
              )}
              {actividad.map((a, idx) => (
                <div key={idx} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50/60 border border-slate-100/80">
                  <span className="text-base leading-none">{ICONO_ACTIVIDAD[a.tipo]}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-slate-800 truncate">
                      {a.vendedor_nombre}{a.cliente_nombre ? ` · ${a.cliente_nombre}` : ""}
                    </p>
                    <p className="text-[10px] text-slate-500 truncate">{a.descripcion}</p>
                  </div>
                  <span className="text-[9px] font-semibold text-slate-400 whitespace-nowrap">{tiempoRelativo(a.fecha)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ================= SECCIÓN: MONITOREO INTEGRAL DE OPERACIONES ================= */}
      <div className="space-y-3">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 px-1">🌐 Monitoreo Integral de Operaciones en Tiempo Real</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Tarjeta Delivery Exprés */}
          <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm hover:shadow-md transition-all space-y-4">
            <div className="flex justify-between items-center border-b border-slate-50 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🛵</span>
                <h4 className="text-sm font-black text-slate-900 tracking-tight">Despacho & Delivery Exprés</h4>
              </div>
              <span className="h-2 w-2 rounded-full bg-blue-500 animate-ping" />
            </div>
            <div className="space-y-3">
              <div className="flex justify-between text-xs font-medium">
                <span className="text-slate-500">Pedidos en Tránsito</span>
                <span className="font-bold text-slate-800">3 Moto-Repartidores</span>
              </div>
              <div className="flex justify-between text-xs font-medium">
                <span className="text-slate-500">Tiempo Promedio Entrega</span>
                <span className="font-bold text-slate-800">18.4 minutos</span>
              </div>
              <div className="flex justify-between text-xs font-medium">
                <span className="text-slate-500">Entregados Hoy</span>
                <span className="font-mono font-bold text-emerald-600">24 Despachos</span>
              </div>
            </div>
          </div>

          {/* Tarjeta Redes Sociales & WhatsApp Bot */}
          <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm hover:shadow-md transition-all space-y-4">
            <div className="flex justify-between items-center border-b border-slate-50 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🤖</span>
                <h4 className="text-sm font-black text-slate-900 tracking-tight">WhatsApp & Redes Bot AI</h4>
              </div>
              <span className="h-2 w-2 rounded-full bg-purple-500 animate-ping" />
            </div>
            <div className="space-y-3">
              <div className="flex justify-between text-xs font-medium">
                <span className="text-slate-500">Conversaciones Activas</span>
                <span className="font-bold text-slate-800">14 Chats Simultáneos</span>
              </div>
              <div className="flex justify-between text-xs font-medium">
                <span className="text-slate-500">Tasa de Auto-Resolución</span>
                <span className="font-bold text-purple-600">92.1% (Preguntas Frecuentes)</span>
              </div>
              <div className="flex justify-between text-xs font-medium">
                <span className="text-slate-500">Fichas Auto-Registradas</span>
                <span className="font-mono font-bold text-slate-800">12 Clientes Nuevos</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ================= SECCIÓN: DESGLOSE CRÍTICO DE INVENTARIOS EN VIVO (CINTAS) ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* DETALLE COMPLETO: QUÉ SE NECESITA REPONER URGENTE (CINTA) */}
        <div className="rounded-3xl bg-white border border-slate-100 shadow-sm overflow-hidden flex flex-col justify-between">
          <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
            <h4 className="text-xs font-black uppercase text-slate-900 tracking-wider flex items-center gap-2">
              <span className="text-sm">📉</span> Auditoría de Quiebres: Alerta de Reorden Inminente
            </h4>
            <span className="text-[10px] font-bold bg-rose-100 text-rose-800 px-2.5 py-0.5 rounded-full uppercase">Crítico</span>
          </div>
          <div className="p-4 flex gap-4 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200">
            {reponerList.map((item) => (
              <div key={item.id} className="flex-none w-56 p-4 rounded-2xl border border-slate-100 bg-slate-50/50 flex flex-col justify-between hover:shadow-sm transition-all duration-200">
                <div>
                  <div className="flex justify-between items-start gap-1">
                    <h5 className="text-xs font-black text-slate-900 line-clamp-2" title={item.nombre}>{item.nombre}</h5>
                    <span className="text-[9px] font-mono bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-bold">{item.id}</span>
                  </div>
                  <p className="text-[10px] font-semibold text-slate-400 mt-1 truncate">{item.proveedor}</p>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between items-center text-[10px] font-bold">
                    <span className="text-slate-500">Stock Actual</span>
                    <span className="text-rose-600 font-mono">{item.stock} / {item.minimo} u.</span>
                  </div>
                  <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-rose-500 h-full rounded-full" 
                      style={{ width: `${Math.min(100, (item.stock / item.minimo) * 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center text-[9px] font-bold text-slate-500 border-t border-slate-100/80 pt-2 mt-2">
                    <span>Rotación Mensual</span>
                    <span className="text-blue-600 font-mono">{item.velocidad_mes} u./mes</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="p-3 bg-slate-50/50 border-t border-slate-100 text-[11px] font-bold text-slate-400 text-center uppercase tracking-wider">
            🚨 Total {reponerList.length} SKU cruzados por debajo del stock mínimo de seguridad.
          </div>
        </div>

        {/* DETALLE COMPLETO: QUÉ LOTES ESTÁN PRÓXIMOS A VENCER (CINTA) */}
        <div className="rounded-3xl bg-white border border-slate-100 shadow-sm overflow-hidden flex flex-col justify-between">
          <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
            <h4 className="text-xs font-black uppercase text-slate-900 tracking-wider flex items-center gap-2">
              <span className="text-sm">⏳</span> Cronómetro de Vencimiento: Alerta de Pérdidas por FV
            </h4>
            <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full uppercase">Lotes</span>
          </div>
          <div className="p-4 flex gap-4 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200">
            {vencerList.map((item) => (
              <div key={item.id} className="flex-none w-52 p-4 rounded-2xl border border-slate-100 bg-slate-50/50 flex flex-col justify-between hover:shadow-sm transition-all duration-200">
                <div>
                  <div className="flex justify-between items-start gap-1">
                    <h5 className="text-xs font-black text-slate-900 line-clamp-2" title={item.nombre}>{item.nombre}</h5>
                    <span className="text-[9px] font-mono bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-bold">{item.id}</span>
                  </div>
                  <div className="mt-3">
                    <span className={`inline-block px-2.5 py-1 rounded-xl text-[10px] font-black font-mono border ${
                      item.severidad === "danger"
                        ? "bg-rose-50 text-rose-700 border-rose-100 animate-pulse"
                        : "bg-amber-50 text-amber-700 border-amber-100"
                    }`}>
                      Vence en {item.dias} días
                    </span>
                  </div>
                </div>
                <div className="mt-4 flex justify-between items-center border-t border-slate-100 pt-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Valor Lote</span>
                  <span className="text-xs font-mono font-black text-slate-800">${fmt(item.lote_plata)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="p-3 bg-slate-50/50 border-t border-slate-100 text-[11px] font-bold text-rose-600 text-center uppercase tracking-wider">
            ⚠️ Atención: Requiere aplicar descuento por taquilla para liquidar lotes críticos.
          </div>
        </div>

      </div>

      {/* ================= MODAL: DRILL-DOWN DE RUBRO ================= */}
      {rubroSeleccionado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in overflow-y-auto">
          <div className="w-full max-w-4xl bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 relative my-8">
            <button
              type="button"
              onClick={() => setRubroSeleccionado(null)}
              className="absolute top-4 right-4 z-10 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full w-8 h-8 flex items-center justify-center font-bold transition-all"
              title="Cerrar"
            >
              ✕
            </button>

            <h3 className="text-xl font-black text-slate-900" title={rubroSeleccionado.nombre}>{rubroSeleccionado.nombre}</h3>
            <p className="text-xs text-slate-400 mt-0.5 mb-4">Detalle de ventas, mejores productos y mejor cliente para este rubro.</p>

            <SelectorRangoFechas
              desde={rangoDetalleDesde}
              hasta={rangoDetalleHasta}
              onChange={(d, h) => { setRangoDetalleDesde(d); setRangoDetalleHasta(h); }}
            />

            {cargandoDetalle ? (
              <div className="py-16 text-center text-sm text-slate-400 font-medium animate-pulse">Cargando detalle del rubro...</div>
            ) : !detalleRubro ? (
              <div className="py-16 text-center text-sm text-slate-400 font-medium">No hay datos de ventas para este rubro en el rango seleccionado.</div>
            ) : (
              <div className="mt-5 space-y-5">
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 text-center">
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Monto Total</p>
                    <p className="text-base font-black text-slate-900 font-mono">${fmt(Number(detalleRubro.monto_total_usd))}</p>
                  </div>
                  <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 text-center">
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Kilos/Unidades</p>
                    <p className="text-base font-black text-slate-900 font-mono">{fmt(Number(detalleRubro.kilos_total))}</p>
                  </div>
                  <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 text-center">
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Tickets</p>
                    <p className="text-base font-black text-slate-900 font-mono">{detalleRubro.tickets_total}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <h4 className="text-[10px] font-black uppercase text-slate-500 mb-2">🏆 Mejor producto por monto</h4>
                    <div className="space-y-1.5">
                      {detalleRubro.top_productos_por_monto.length === 0 && <p className="text-xs text-slate-400">Sin datos.</p>}
                      {detalleRubro.top_productos_por_monto.map((p: any) => (
                        <div key={p.producto_id} className="flex justify-between items-center bg-slate-50/60 rounded-xl px-3 py-2 text-xs">
                          <span className="font-semibold text-slate-700 truncate">{p.nombre}</span>
                          <span className="font-mono font-bold text-slate-900 whitespace-nowrap ml-2">${fmt(Number(p.monto_usd))}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-[10px] font-black uppercase text-slate-500 mb-2">📦 Mejor producto por cantidad</h4>
                    <div className="space-y-1.5">
                      {detalleRubro.top_productos_por_cantidad.length === 0 && <p className="text-xs text-slate-400">Sin datos.</p>}
                      {detalleRubro.top_productos_por_cantidad.map((p: any) => (
                        <div key={p.producto_id} className="flex justify-between items-center bg-slate-50/60 rounded-xl px-3 py-2 text-xs">
                          <span className="font-semibold text-slate-700 truncate">{p.nombre}</span>
                          <span className="font-mono font-bold text-slate-900 whitespace-nowrap ml-2">{fmt(Number(p.cantidad_vendida))}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-[10px] font-black uppercase text-slate-500 mb-2">👤 Mejores clientes</h4>
                  <div className="space-y-1.5">
                    {detalleRubro.mejores_clientes.length === 0 && <p className="text-xs text-slate-400">Sin datos.</p>}
                    {detalleRubro.mejores_clientes.map((c: any) => (
                      <div key={c.cliente_id} className="flex justify-between items-center bg-slate-50/60 rounded-xl px-3 py-2 text-xs">
                        <span className="font-semibold text-slate-700 truncate">{c.nombre} <span className="text-slate-400 font-normal">({c.num_compras} compras)</span></span>
                        <span className="font-mono font-bold text-slate-900 whitespace-nowrap ml-2">${fmt(Number(c.monto_usd))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}