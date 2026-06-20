import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { GoogleMap, Marker, Polyline } from "@react-google-maps/api";
import apiClient from "../api/client";
import { useGoogleMaps } from "../hooks/useGoogleMaps";
import { calcularRutaReal, type LatLng } from "../lib/geo";

interface Vehiculo {
  id: number;
  placa: string;
  tipo: string;
  marca: string;
  modelo: string;
}

interface Pedido {
  id: number;
  cliente_nombre: string;
  cliente_telefono: string;
  destino: string;
  destino_lat: number;
  destino_lng: number;
  monto_total: number;
  metodo_pago: string;
  estado: string;
  vehiculo_id: number | null;
  chofer_cedula: string;
  notas: string | null;
}

function getTokenClaims(): { rol: string | null; email: string | null } {
  const token = localStorage.getItem("access_token");
  if (!token) return { rol: null, email: null };
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return { rol: payload.rol ?? null, email: payload.email ?? null };
  } catch {
    return { rol: null, email: null };
  }
}

// Próximo estado del workflow que puede disparar el propio repartidor desde su celular
const SIGUIENTE_ESTADO: Record<string, { siguiente: string; etiqueta: string }> = {
  CREADO: { siguiente: "EN_VIA", etiqueta: "🚴 Salir a Entregar" },
  ARMADO: { siguiente: "EN_VIA", etiqueta: "🚴 Salir a Entregar" },
  FACTURADO: { siguiente: "EN_VIA", etiqueta: "🚴 Salir a Entregar" },
  EN_VIA: { siguiente: "DESPACHADO", etiqueta: "📦 Marcar Entregado" },
  DESPACHADO: { siguiente: "PAGADO", etiqueta: "💰 Confirmar Cobro" },
  CREDITO: { siguiente: "PAGADO", etiqueta: "💰 Confirmar Cobro" },
};

const ESTADO_LABEL: Record<string, string> = {
  CREADO: "Creado", ARMADO: "Armado", FACTURADO: "Facturado", EN_VIA: "En Vía",
  DESPACHADO: "Despachado", PAGADO: "Pagado", CREDITO: "A Crédito",
};

const MAP_CONTAINER_STYLE: React.CSSProperties = { width: "100%", height: "220px", borderRadius: "0.75rem" };
const VEHICULO_LS_KEY = "repartidor_vehiculo_id";
const INTERVALO_REFRESCO_PEDIDOS_MS = 8000;
const INTERVALO_MINIMO_ENVIO_GPS_MS = 15000;

export default function ModuloRepartidor() {
  const { isLoaded } = useGoogleMaps();
  const { email } = useMemo(() => getTokenClaims(), []);

  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [vehiculoId, setVehiculoId] = useState<number | null>(() => {
    const guardado = localStorage.getItem(VEHICULO_LS_KEY);
    return guardado ? Number(guardado) : null;
  });

  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [gpsActivo, setGpsActivo] = useState(false);
  const [gpsError, setGpsError] = useState("");
  const [posicionActual, setPosicionActual] = useState<LatLng | null>(null);
  const [accionando, setAccionando] = useState<number | null>(null);
  const [ruta, setRuta] = useState<LatLng[] | null>(null);
  const [rutaInfo, setRutaInfo] = useState<{ distanciaKm: number; etaMin: number } | null>(null);

  const ultimoEnvioRef = useRef<number>(0);

  useEffect(() => {
    apiClient.get<Vehiculo[]>("/api/v1/vehiculos").then((res) => setVehiculos(res.data)).catch(() => {});
  }, []);

  const cargarPedidos = useCallback(() => {
    apiClient.get<Pedido[]>("/api/v1/pedidos")
      .then((res) => {
        const propios = res.data.filter((p) =>
          p.estado !== "PAGADO" &&
          ((email !== null && p.chofer_cedula === email) || (vehiculoId !== null && p.vehiculo_id === vehiculoId))
        );
        setPedidos(propios);
      })
      .catch(() => setPedidos([]));
  }, [email, vehiculoId]);

  useEffect(() => {
    if (vehiculoId === null) return;
    cargarPedidos();
    const t = setInterval(cargarPedidos, INTERVALO_REFRESCO_PEDIDOS_MS);
    return () => clearInterval(t);
  }, [vehiculoId, cargarPedidos]);

  // Reporta la posición GPS en vivo al backend (limitado a un envío cada ~15s para no saturar)
  useEffect(() => {
    if (vehiculoId === null) return;
    if (!("geolocation" in navigator)) {
      setGpsError("Este dispositivo no soporta geolocalización.");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const coords: LatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPosicionActual(coords);
        setGpsActivo(true);
        setGpsError("");

        const ahora = Date.now();
        if (ahora - ultimoEnvioRef.current < INTERVALO_MINIMO_ENVIO_GPS_MS) return;
        ultimoEnvioRef.current = ahora;
        apiClient.put(`/api/v1/vehiculos/${vehiculoId}/ubicacion`, coords).catch(() => {});
      },
      (err) => {
        setGpsActivo(false);
        setGpsError(err.message || "No se pudo obtener tu ubicación GPS. Activa el permiso de ubicación en tu navegador.");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [vehiculoId]);

  const pedidoActivo = pedidos.find((p) => p.estado === "EN_VIA") ?? pedidos[0] ?? null;

  // Calcula la ruta (real con Google Maps si hay key, o aproximada si no) desde mi posición al pedido activo
  useEffect(() => {
    if (!pedidoActivo || !posicionActual) {
      setRuta(null);
      setRutaInfo(null);
      return;
    }
    let vigente = true;
    calcularRutaReal(posicionActual, { lat: pedidoActivo.destino_lat, lng: pedidoActivo.destino_lng }).then((r) => {
      if (!vigente) return;
      setRutaInfo({ distanciaKm: r.distanciaKm, etaMin: r.etaMin });
      setRuta(r.path ?? null);
    });
    return () => { vigente = false; };
  }, [pedidoActivo?.id, posicionActual?.lat, posicionActual?.lng]);

  async function avanzarEstado(pedido: Pedido) {
    const siguiente = SIGUIENTE_ESTADO[pedido.estado];
    if (!siguiente) return;
    setAccionando(pedido.id);
    try {
      await apiClient.put(`/api/v1/pedidos/${pedido.id}/estado`, { estado: siguiente.siguiente });
      cargarPedidos();
    } catch {
      // Si falla, el pedido sigue visible en su estado actual para reintentar
    } finally {
      setAccionando(null);
    }
  }

  function elegirVehiculo(id: number) {
    localStorage.setItem(VEHICULO_LS_KEY, String(id));
    setVehiculoId(id);
  }

  function cambiarVehiculo() {
    localStorage.removeItem(VEHICULO_LS_KEY);
    setVehiculoId(null);
    setPedidos([]);
  }

  // --- Paso 1: el repartidor elige con qué vehículo está trabajando hoy ---
  if (vehiculoId === null) {
    return (
      <div className="p-6 max-w-md mx-auto">
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4">
          <h1 className="text-xl font-black text-slate-900">🚚 Mi Ruta de Delivery</h1>
          <p className="text-sm text-slate-500">¿Con qué vehículo vas a trabajar hoy? Tu ubicación se reportará usando este vehículo.</p>
          <div className="space-y-2">
            {vehiculos.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-6">No hay vehículos registrados todavía.</p>
            )}
            {vehiculos.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => elegirVehiculo(v.id)}
                className="w-full text-left p-4 rounded-2xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 transition-all"
              >
                <span className="font-bold text-slate-800 block">{v.placa} · {v.tipo}</span>
                <span className="text-xs text-slate-400">{v.marca} {v.modelo}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const vehiculoActual = vehiculos.find((v) => v.id === vehiculoId);

  return (
    <div className="p-4 max-w-md mx-auto space-y-4">
      {/* HEADER */}
      <div className="bg-white rounded-3xl p-4 border border-slate-100 shadow-sm flex items-center justify-between">
        <div>
          <h1 className="text-lg font-black text-slate-900">🚚 Mi Ruta</h1>
          <p className="text-xs text-slate-400 font-mono">{vehiculoActual?.placa ?? "—"}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${gpsActivo ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
            {gpsActivo ? "🟢 GPS activo" : "🔴 GPS inactivo"}
          </span>
          <button type="button" onClick={cambiarVehiculo} className="text-[10px] text-slate-400 hover:text-slate-600 font-semibold underline">
            Cambiar vehículo
          </button>
        </div>
      </div>

      {gpsError && (
        <div className="bg-rose-50 border border-rose-100 rounded-2xl p-3 text-xs text-rose-600 font-medium">
          ⚠️ {gpsError}
        </div>
      )}

      {/* MAPA / RUTA AL PEDIDO ACTIVO */}
      {pedidoActivo && (
        <div className="bg-white rounded-3xl p-4 border border-slate-100 shadow-sm space-y-3">
          <h2 className="text-sm font-bold text-slate-800">📍 Entrega Activa: {pedidoActivo.cliente_nombre}</h2>

          {isLoaded && posicionActual ? (
            <GoogleMap mapContainerStyle={MAP_CONTAINER_STYLE} center={posicionActual} zoom={14}>
              <Marker position={posicionActual} label={{ text: "🛵", fontSize: "16px" }} />
              <Marker
                position={{ lat: pedidoActivo.destino_lat, lng: pedidoActivo.destino_lng }}
                label={{ text: "📍", fontSize: "16px" }}
              />
              {ruta && (
                <Polyline
                  path={ruta}
                  options={{ strokeColor: "#ef4444", strokeWeight: 4, strokeOpacity: 0.8 }}
                />
              )}
            </GoogleMap>
          ) : (
            <div className="h-24 rounded-2xl bg-slate-50 border border-dashed border-slate-200 flex items-center justify-center text-xs text-slate-400 text-center px-4">
              {posicionActual ? "Mapa no disponible (configura la API Key de Google Maps)." : "Esperando señal GPS de tu celular..."}
            </div>
          )}

          {rutaInfo && (
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-blue-50 rounded-xl p-2.5 text-center">
                <p className="text-[9px] font-bold text-blue-400 uppercase">Distancia</p>
                <p className="text-sm font-black text-blue-700">{rutaInfo.distanciaKm.toFixed(2)} km</p>
              </div>
              <div className="bg-emerald-50 rounded-xl p-2.5 text-center">
                <p className="text-[9px] font-bold text-emerald-400 uppercase">ETA</p>
                <p className="text-sm font-black text-emerald-700">{rutaInfo.etaMin} min</p>
              </div>
            </div>
          )}

          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${pedidoActivo.destino_lat},${pedidoActivo.destino_lng}&travelmode=driving`}
            target="_blank"
            rel="noreferrer"
            className="block w-full text-center bg-slate-900 hover:bg-slate-800 text-white rounded-xl py-2.5 text-xs font-bold transition-all"
          >
            🧭 Abrir en Google Maps (navegación)
          </a>
        </div>
      )}

      {/* LISTA DE PEDIDOS ASIGNADOS */}
      <div className="bg-white rounded-3xl p-4 border border-slate-100 shadow-sm space-y-3">
        <h2 className="text-sm font-bold text-slate-800">📦 Pedidos Asignados ({pedidos.length})</h2>

        {pedidos.length === 0 ? (
          <p className="text-center text-xs text-slate-400 py-8">No tienes pedidos de delivery asignados por ahora.</p>
        ) : (
          <div className="space-y-3">
            {pedidos.map((p) => {
              const accion = SIGUIENTE_ESTADO[p.estado];
              const esActivo = p.id === pedidoActivo?.id;
              return (
                <div
                  key={p.id}
                  className={`rounded-2xl border p-3.5 space-y-2 ${esActivo ? "border-blue-300 bg-blue-50/40" : "border-slate-100 bg-slate-50/50"}`}
                >
                  <div className="flex justify-between items-start">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800 text-sm truncate">{p.cliente_nombre}</p>
                      <p className="text-[11px] text-slate-500 truncate">{p.destino}</p>
                    </div>
                    <span className="text-[9px] font-bold uppercase px-2 py-0.5 bg-slate-100 rounded-full text-slate-600 shrink-0 ml-2">
                      {ESTADO_LABEL[p.estado] ?? p.estado}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold text-slate-700">${p.monto_total.toFixed(2)} · {p.metodo_pago}</span>
                    <a href={`tel:${p.cliente_telefono}`} className="text-blue-600 font-bold">📞 Llamar</a>
                  </div>

                  {p.notas && <p className="text-[11px] text-slate-400 italic">"{p.notas}"</p>}

                  {accion && (
                    <button
                      type="button"
                      onClick={() => avanzarEstado(p)}
                      disabled={accionando === p.id}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-2 text-xs font-bold transition-all disabled:opacity-50"
                    >
                      {accionando === p.id ? "Actualizando..." : accion.etiqueta}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
