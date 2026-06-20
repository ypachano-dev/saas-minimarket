import { useEffect, useState, useCallback } from "react";
import { GoogleMap, Marker, Polyline } from "@react-google-maps/api";
import apiClient from "../api/client";
import DeliveryOrderForm from "./DeliveryOrderForm";
import { useGoogleMaps, TIENE_GOOGLE_MAPS_KEY } from "../hooks/useGoogleMaps";
import { CENTRO_POR_DEFECTO, calcularRutaReal, type LatLng } from "../lib/geo";

interface Pedido {
  id: number;
  cliente: string;
  direccion: string;
  monto_usd: number;
  monto_ves: number;
  vehiculo_id: number | null;
  destino_lat: number;
  destino_lng: number;
  x: number;
  y: number;
  estado?: string;
}

interface VehiculoMapa {
  id: number;
  placa: string;
  tipo: string;
  lat: number | null;
  lng: number | null;
  ubicacion_actualizada_en: string | null;
}

interface RutaInfo {
  distanciaKm: number;
  etaMin: number;
  esReal: boolean;
}

// Avenidas principales de Barinas (líneas guía del mapa simulado de respaldo)
const AVENIDAS = [
  { x1: 0, y1: 60, x2: 500, y2: 60 },   // Av. 23 de Enero
  { x1: 0, y1: 180, x2: 500, y2: 180 }, // Av. Marqués del Pumar
  { x1: 0, y1: 300, x2: 500, y2: 300 }, // Av. Industrial
  { x1: 100, y1: 0, x2: 100, y2: 360 }, // Calle Arzobispo Méndez
  { x1: 250, y1: 0, x2: 250, y2: 360 }, // Av. Cuatricentenaria
  { x1: 400, y1: 0, x2: 400, y2: 360 }, // Av. Los Periodistas
];
const ABASTO_SVG = { x: 250, y: 180 };

const MAP_CONTAINER_STYLE: React.CSSProperties = { width: "100%", height: "100%", borderRadius: "0.5rem" };

export default function MapaDelivery() {
  const { isLoaded } = useGoogleMaps();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [vehiculos, setVehiculos] = useState<VehiculoMapa[]>([]);
  const [seleccionado, setSeleccionado] = useState<Pedido | null>(null);
  const [moneda, setMoneda] = useState<"USD" | "VES">("USD");
  const [mostrarForm, setMostrarForm] = useState(false);
  const [ruta, setRuta] = useState<LatLng[] | null>(null);
  const [rutaInfo, setRutaInfo] = useState<RutaInfo | null>(null);

  const cargarPedidos = useCallback(() => {
    apiClient.get<any[]>("/api/v1/pedidos")
      .then((res) => {
        const list: Pedido[] = res.data.map((p: any) => ({
          id: p.id,
          cliente: p.cliente_nombre,
          direccion: p.destino,
          monto_usd: p.monto_total,
          monto_ves: p.monto_total * 60.0,
          vehiculo_id: p.vehiculo_id,
          destino_lat: p.destino_lat,
          destino_lng: p.destino_lng,
          x: p.coord_x,
          y: p.coord_y,
          estado: p.estado,
        }));
        setPedidos(list.filter((p) => p.estado !== "PAGADO"));
      })
      .catch(() => setPedidos([]));
  }, []);

  const cargarVehiculos = useCallback(() => {
    apiClient.get<any[]>("/api/v1/vehiculos")
      .then((res) => {
        setVehiculos(res.data.map((v: any) => ({
          id: v.id,
          placa: v.placa,
          tipo: v.tipo,
          lat: v.lat ?? null,
          lng: v.lng ?? null,
          ubicacion_actualizada_en: v.ubicacion_actualizada_en ?? null,
        })));
      })
      .catch(() => {});
  }, []);

  // Carga inicial + refresco periódico de pedidos en ruta y posición GPS de cada repartidor
  useEffect(() => {
    cargarPedidos();
    cargarVehiculos();
    const t = setInterval(() => {
      cargarPedidos();
      cargarVehiculos();
    }, 10000);
    return () => clearInterval(t);
  }, [cargarPedidos, cargarVehiculos]);

  const vehiculoAsignado = seleccionado ? vehiculos.find((v) => v.id === seleccionado.vehiculo_id) ?? null : null;
  const repartidorEnLinea = vehiculoAsignado?.lat != null && vehiculoAsignado?.lng != null;

  // Recalcula la ruta real (Routes API) cuando cambia el pedido seleccionado o se mueve su repartidor
  useEffect(() => {
    if (!isLoaded || !seleccionado) {
      setRuta(null);
      setRutaInfo(null);
      return;
    }
    const origen: LatLng = repartidorEnLinea
      ? { lat: vehiculoAsignado!.lat as number, lng: vehiculoAsignado!.lng as number }
      : CENTRO_POR_DEFECTO;
    const destino: LatLng = { lat: seleccionado.destino_lat, lng: seleccionado.destino_lng };

    let vigente = true;
    calcularRutaReal(origen, destino).then((r) => {
      if (!vigente) return;
      setRutaInfo({ distanciaKm: r.distanciaKm, etaMin: r.etaMin, esReal: r.esReal });
      setRuta(r.path ?? null);
    });
    return () => { vigente = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, seleccionado?.id, vehiculoAsignado?.lat, vehiculoAsignado?.lng]);

  const totalSeleccionado = seleccionado
    ? moneda === "USD" ? seleccionado.monto_usd : seleccionado.monto_ves
    : 0;

  return (
    <div className="grid grid-cols-2 gap-4 p-4">
      {/* Panel izquierdo: pedidos en ruta */}
      <div className="rounded-xl border p-4 bg-white shadow-sm flex flex-col h-[85vh] overflow-hidden">
        <div className="flex justify-between items-center mb-3 pb-3 border-b border-slate-100">
          <h2 className="text-md font-bold text-slate-800">
            {mostrarForm ? "Registrar Delivery" : "Pedidos en Ruta"}
          </h2>
          <button
            onClick={() => setMostrarForm(!mostrarForm)}
            className="px-3.5 py-1.5 rounded-xl bg-slate-950 hover:bg-blue-600 text-white font-bold text-[10px] uppercase tracking-wider shadow-sm transition-all duration-300"
          >
            {mostrarForm ? "📋 Ver Lista / Mapa" : "🚚 Registrar Pedido"}
          </button>
        </div>

        {!TIENE_GOOGLE_MAPS_KEY && (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 font-medium">
            🔑 Configura <code className="font-mono">VITE_GOOGLE_MAPS_API_KEY</code> en <code className="font-mono">frontend/.env</code> para activar el mapa real, trazo de ruta y ETA exactos. Por ahora se usa el mapa simulado.
          </div>
        )}

        {mostrarForm ? (
          <div className="overflow-y-auto flex-1 pr-1">
            <DeliveryOrderForm onOrderCreated={() => { setMostrarForm(false); cargarPedidos(); }} />
          </div>
        ) : (
          <div className="flex flex-col flex-1 overflow-hidden">
            <ul className="divide-y overflow-y-auto flex-1 pr-1">
              {pedidos.map((p) => {
                const vehiculo = vehiculos.find((v) => v.id === p.vehiculo_id);
                return (
                  <li
                    key={p.id}
                    onClick={() => setSeleccionado(p)}
                    className={`cursor-pointer p-3 rounded-xl transition-all duration-200 hover:bg-slate-50 flex flex-col gap-0.5 ${seleccionado?.id === p.id ? "bg-blue-50/50 border-l-4 border-blue-600 pl-2" : ""}`}
                  >
                    <div className="flex justify-between">
                      <p className="font-bold text-slate-900 text-xs">{p.cliente}</p>
                      <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 bg-slate-100 rounded-md text-slate-600">{p.estado || "Despachado"}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium truncate">{p.direccion}</p>
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-semibold text-slate-700 font-mono">${p.monto_usd.toFixed(2)} / Bs. {p.monto_ves.toFixed(2)}</p>
                      {vehiculo && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${vehiculo.lat != null ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
                          {vehiculo.placa} {vehiculo.lat != null ? "🟢" : "⚪"}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
              {pedidos.length === 0 && (
                <p className="text-center text-xs text-slate-400 py-12 font-medium">No hay pedidos de delivery en ruta.</p>
              )}
            </ul>

            {seleccionado && (
              <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total a cobrar</span>
                  <div className="flex gap-1.5 bg-slate-200/60 p-0.5 rounded-lg text-[10px] font-bold">
                    <button className={`px-2 py-0.5 rounded-md ${moneda === "USD" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`} onClick={() => setMoneda("USD")}>USD</button>
                    <button className={`px-2 py-0.5 rounded-md ${moneda === "VES" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`} onClick={() => setMoneda("VES")}>VES</button>
                  </div>
                </div>
                <p className="text-2xl font-black text-slate-900 tracking-tight">
                  {moneda === "USD" ? "$" : "Bs."} {totalSeleccionado.toFixed(2)}
                </p>

                {rutaInfo && (
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60">
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Distancia {rutaInfo.esReal ? "(real)" : "(aprox.)"}</p>
                      <p className="text-sm font-black text-blue-700">{rutaInfo.distanciaKm.toFixed(2)} km</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">ETA {rutaInfo.esReal ? "(real)" : "(aprox.)"}</p>
                      <p className="text-sm font-black text-emerald-700">{rutaInfo.etaMin} min</p>
                    </div>
                  </div>
                )}
                {!repartidorEnLinea && seleccionado.vehiculo_id && (
                  <p className="text-[10px] text-amber-600 font-medium">⚪ El repartidor aún no ha reportado su ubicación GPS desde su celular.</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Panel derecho: mapa */}
      <div className="rounded-lg border p-3 flex flex-col h-[85vh]">
        <h2 className="mb-2 text-lg font-semibold">Mapa de Reparto - Barinas</h2>

        {isLoaded ? (
          <div className="flex-1 rounded overflow-hidden">
            <GoogleMap
              mapContainerStyle={MAP_CONTAINER_STYLE}
              center={CENTRO_POR_DEFECTO}
              zoom={13}
            >
              <Marker
                position={CENTRO_POR_DEFECTO}
                label={{ text: "🏬", fontSize: "18px" }}
                title="Abasto Central"
              />

              {vehiculos.filter((v) => v.lat != null && v.lng != null).map((v) => (
                <Marker
                  key={v.id}
                  position={{ lat: v.lat as number, lng: v.lng as number }}
                  label={{ text: "🛵", fontSize: "16px" }}
                  title={`${v.placa} (${v.tipo})`}
                />
              ))}

              {pedidos.map((p) => (
                <Marker
                  key={p.id}
                  position={{ lat: p.destino_lat, lng: p.destino_lng }}
                  onClick={() => setSeleccionado(p)}
                  label={{ text: "📍", fontSize: "16px" }}
                  title={p.cliente}
                />
              ))}

              {ruta && (
                <Polyline
                  path={ruta}
                  options={{ strokeColor: "#ef4444", strokeWeight: 4, strokeOpacity: 0.8 }}
                />
              )}
            </GoogleMap>
          </div>
        ) : (
          <svg viewBox="0 0 500 360" className="w-full flex-1 rounded border bg-green-50">
            {AVENIDAS.map((a, i) => (
              <line key={i} x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke="#cbd5e1" strokeWidth={4} />
            ))}

            {/* Ruta resaltada: Abasto -> Cliente (aproximación, sin Google Maps) */}
            {seleccionado && (
              <line x1={ABASTO_SVG.x} y1={ABASTO_SVG.y} x2={seleccionado.x} y2={seleccionado.y} stroke="#ef4444" strokeWidth={3} strokeDasharray="6 4" />
            )}

            {/* Abasto Central */}
            <rect x={ABASTO_SVG.x - 8} y={ABASTO_SVG.y - 8} width={16} height={16} fill="#2563eb" />
            <text x={ABASTO_SVG.x + 12} y={ABASTO_SVG.y + 4} fontSize={11} fill="#2563eb">Abasto Central</text>

            {/* Clientes de pedidos */}
            {pedidos.map((p) => (
              <circle key={p.id} cx={p.x} cy={p.y} r={5} fill={p.id === seleccionado?.id ? "#ef4444" : "#f59e0b"} />
            ))}
          </svg>
        )}
      </div>
    </div>
  );
}
