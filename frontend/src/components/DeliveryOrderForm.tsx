import { useState, useEffect, type FormEvent } from "react";
import apiClient from "../api/client";
import PlaceAutocompleteInput from "./PlaceAutocompleteInput";
import { useGoogleMaps } from "../hooks/useGoogleMaps";
import { calcularRutaReal } from "../lib/geo";

// ---- Tipos de entidades ----
interface Vehiculo {
  id: number;
  placa: string;
  tipo: string;
  marca: string;
  modelo: string;
}

interface Chofer {
  cedula: string;
  nombre: string;
  cargo: string;
}

interface UbicacionConocida {
  nombre: string;
  lat: number;
  lng: number;
}

type EstadoPedido = "CREADO" | "ARMADO" | "FACTURADO" | "EN_VIA" | "DESPACHADO" | "PAGADO" | "CREDITO";

interface PedidoForm {
  cliente_nombre: string;
  cliente_telefono: string;
  cliente_direccion: string;
  vehiculo_id: string;
  chofer_cedula: string;
  origen: string;
  origen_lat: number | null;
  origen_lng: number | null;
  destino: string;
  destino_lat: number | null;
  destino_lng: number | null;
  distancia_km: number | null;
  eta_min: number | null;
  estado: EstadoPedido;
  metodo_pago: string;
  monto_total: string;
  notas: string;
}

// ---- Datos semilla (flota y personal de delivery) ----
const VEHICULOS_SEED: Vehiculo[] = [
  { id: 1, placa: "AB123CD", tipo: "Moto", marca: "Yamaha", modelo: "FZ 16" },
  { id: 2, placa: "GHI789J", tipo: "Carro", marca: "Chevrolet", modelo: "Aveo" },
  { id: 3, placa: "JKL456M", tipo: "Camión", marca: "Ford", modelo: "F-350" },
];

const CHOFERES_SEED: Chofer[] = [
  { cedula: "V-33333333", nombre: "Luis Rodríguez", cargo: "Repartidor" },
  { cedula: "V-44444444", nombre: "Pedro Ramírez", cargo: "Repartidor" },
  { cedula: "V-11111111", nombre: "Carlos Pérez", cargo: "Cajero" },
];

// Direcciones conocidas con coordenadas para simular el geocoder de Google Maps
const UBICACIONES_CONOCIDAS: UbicacionConocida[] = [
  { nombre: "Sede Principal - Av. 23 de Enero, Barinas", lat: 8.6226, lng: -70.2075 },
  { nombre: "Urbanización La Caramuca, Barinas", lat: 8.6402, lng: -70.2298 },
  { nombre: "Centro Comercial Llano Mall, Barinas", lat: 8.6175, lng: -70.2133 },
  { nombre: "Barrio Alto Barinas, Barinas", lat: 8.6502, lng: -70.1950 },
  { nombre: "Zona Industrial, Barinas", lat: 8.5950, lng: -70.2350 },
  { nombre: "Urbanización El Carmen, Barinas", lat: 8.6080, lng: -70.1900 },
  { nombre: "Terminal de Pasajeros, Barinas", lat: 8.6300, lng: -70.2200 },
];

const METODOS_PAGO = ["Efectivo $", "Efectivo Bs", "Punto de Venta", "Pago Móvil", "Crédito"];

const ESTADOS_PEDIDO: EstadoPedido[] = ["CREADO", "ARMADO", "FACTURADO", "EN_VIA", "DESPACHADO", "PAGADO", "CREDITO"];

// Workflow: desde cada estado solo se permite transicionar a los estados listados (incluye el propio)
const TRANSICIONES_VALIDAS: Record<EstadoPedido, EstadoPedido[]> = {
  CREADO: ["CREADO", "ARMADO"],
  ARMADO: ["ARMADO", "FACTURADO"],
  FACTURADO: ["FACTURADO", "EN_VIA", "CREDITO"],
  EN_VIA: ["EN_VIA", "DESPACHADO"],
  DESPACHADO: ["DESPACHADO", "PAGADO", "CREDITO"],
  PAGADO: ["PAGADO"],
  CREDITO: ["CREDITO", "PAGADO"],
};

const ESTADO_CONFIG: Record<EstadoPedido, { label: string; activo: string; inactivo: string }> = {
  CREADO: { label: "Creado", activo: "bg-slate-900 text-white", inactivo: "bg-slate-100 text-slate-500 hover:bg-slate-200" },
  ARMADO: { label: "Armado", activo: "bg-blue-600 text-white", inactivo: "bg-blue-50 text-blue-700 hover:bg-blue-100" },
  FACTURADO: { label: "Facturado", activo: "bg-violet-600 text-white", inactivo: "bg-violet-50 text-violet-700 hover:bg-violet-100" },
  EN_VIA: { label: "En Vía", activo: "bg-amber-500 text-white", inactivo: "bg-amber-50 text-amber-700 hover:bg-amber-100" },
  DESPACHADO: { label: "Despachado", activo: "bg-cyan-600 text-white", inactivo: "bg-cyan-50 text-cyan-700 hover:bg-cyan-100" },
  PAGADO: { label: "Pagado", activo: "bg-emerald-600 text-white", inactivo: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" },
  CREDITO: { label: "A Crédito", activo: "bg-rose-600 text-white", inactivo: "bg-rose-50 text-rose-700 hover:bg-rose-100" },
};

// ---- Estilos premium UI/UX PRO MAX ----
const inputCls = "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const labelCls = "text-xs font-semibold uppercase tracking-wider text-slate-400";
const cardCls = "rounded-3xl bg-white p-8 border border-slate-100 shadow-sm hover:shadow-md transition-all duration-300";
const btnCls = "w-full rounded-2xl bg-slate-900 py-3 text-sm font-bold text-white shadow-sm transition-all duration-300 hover:bg-slate-700 hover:shadow-md";
const seccionCls = "text-xs font-black uppercase tracking-wider text-slate-900";

// ---- Utilidades de geolocalización ----
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcularEtaMin(distanciaKm: number): number {
  const VELOCIDAD_PROMEDIO_KMH = 28;
  const TIEMPO_PREPARACION_MIN = 5;
  return Math.round((distanciaKm / VELOCIDAD_PROMEDIO_KMH) * 60) + TIEMPO_PREPARACION_MIN;
}

// Recalcula distancia (km) y ETA (min) si origen y destino tienen coordenadas válidas
function aplicarRuta(f: PedidoForm): PedidoForm {
  if (f.origen_lat !== null && f.origen_lng !== null && f.destino_lat !== null && f.destino_lng !== null) {
    const distancia = haversineKm(f.origen_lat, f.origen_lng, f.destino_lat, f.destino_lng);
    return { ...f, distancia_km: Math.round(distancia * 100) / 100, eta_min: calcularEtaMin(distancia) };
  }
  return { ...f, distancia_km: null, eta_min: null };
}

type Msg = { tipo: "ok" | "error"; texto: string } | null;

function MsgLine({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return <p className={`mt-2 text-sm font-medium ${msg.tipo === "ok" ? "text-emerald-600" : "text-red-600"}`}>{msg.texto}</p>;
}

const initialForm: PedidoForm = {
  cliente_nombre: "",
  cliente_telefono: "",
  cliente_direccion: "",
  vehiculo_id: "",
  chofer_cedula: "",
  origen: "",
  origen_lat: null,
  origen_lng: null,
  destino: "",
  destino_lat: null,
  destino_lng: null,
  distancia_km: null,
  eta_min: null,
  estado: "CREADO",
  metodo_pago: METODOS_PAGO[0],
  monto_total: "",
  notas: "",
};

export default function DeliveryOrderForm({
  onOrderCreated,
  initialData,
}: {
  onOrderCreated?: () => void;
  initialData?: Partial<PedidoForm>;
}) {
  const { isLoaded } = useGoogleMaps();
  const [form, setForm] = useState<PedidoForm>({ ...initialForm, ...initialData });
  const [msg, setMsg] = useState<Msg>(null);
  const [sugerenciasOrigenVisibles, setSugerenciasOrigenVisibles] = useState(false);
  const [sugerenciasDestinoVisibles, setSugerenciasDestinoVisibles] = useState(false);
  const [esRutaReal, setEsRutaReal] = useState(false);

  // El widget nuevo (Places API New) solo existe si el script ya cargó Y el proyecto de Google
  // Cloud tiene "Places API (New)" habilitada. Si no, usamos el listado simulado como respaldo
  // en vez del widget legado `Autocomplete`, que Google bloquea para proyectos nuevos.
  const tienePlaceAutocomplete = isLoaded && typeof window !== "undefined" && Boolean((window as any).google?.maps?.places?.PlaceAutocompleteElement);

  // Estados para cargar datos reales del backend
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [choferes, setChoferes] = useState<Chofer[]>([]);

  useEffect(() => {
    apiClient.get<Vehiculo[]>("/api/v1/vehiculos")
      .then((res) => setVehiculos(res.data))
      .catch(() => {});

    apiClient.get<any[]>("/api/v1/usuarios")
      .then((res) => {
        const list = res.data.map((u: any) => ({
          cedula: u.email, // Usamos correo como identificador único para chofer
          nombre: u.nombre,
          cargo: u.rol
        }));
        setChoferes(list);
      })
      .catch(() => {});
  }, []);

  function set<K extends keyof PedidoForm>(key: K, value: PedidoForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onOrigenChange(value: string) {
    setForm((prev) => aplicarRuta({ ...prev, origen: value, origen_lat: null, origen_lng: null }));
    setSugerenciasOrigenVisibles(value.trim().length > 0);
    setEsRutaReal(false);
  }

  function onDestinoChange(value: string) {
    setForm((prev) => aplicarRuta({ ...prev, destino: value, destino_lat: null, destino_lng: null }));
    setSugerenciasDestinoVisibles(value.trim().length > 0);
    setEsRutaReal(false);
  }

  function seleccionarOrigen(ubi: UbicacionConocida) {
    setForm((prev) => aplicarRuta({ ...prev, origen: ubi.nombre, origen_lat: ubi.lat, origen_lng: ubi.lng }));
    setSugerenciasOrigenVisibles(false);
    setEsRutaReal(false);
  }

  function seleccionarDestino(ubi: UbicacionConocida) {
    setForm((prev) => aplicarRuta({ ...prev, destino: ubi.nombre, destino_lat: ubi.lat, destino_lng: ubi.lng }));
    setSugerenciasDestinoVisibles(false);
    setEsRutaReal(false);
  }

  // Cuando el usuario escoge una dirección real del nuevo widget de Places
  function onPlaceOrigenSeleccionado(lugar: { direccion: string; lat: number; lng: number }) {
    setForm((prev) => aplicarRuta({ ...prev, origen: lugar.direccion, origen_lat: lugar.lat, origen_lng: lugar.lng }));
    setEsRutaReal(false);
  }

  function onPlaceDestinoSeleccionado(lugar: { direccion: string; lat: number; lng: number }) {
    setForm((prev) => aplicarRuta({ ...prev, destino: lugar.direccion, destino_lat: lugar.lat, destino_lng: lugar.lng }));
    setEsRutaReal(false);
  }

  // Una vez hay origen y destino reales, reemplaza la aproximación por línea recta con la
  // distancia y el tiempo reales de manejo que calcula la Routes API de Google.
  useEffect(() => {
    if (!isLoaded) return;
    if (form.origen_lat === null || form.origen_lng === null || form.destino_lat === null || form.destino_lng === null) return;

    let vigente = true;
    calcularRutaReal(
      { lat: form.origen_lat, lng: form.origen_lng },
      { lat: form.destino_lat, lng: form.destino_lng }
    ).then((r) => {
      if (!vigente || !r.esReal) return;
      setForm((prev) => ({ ...prev, distancia_km: r.distanciaKm, eta_min: r.etaMin }));
      setEsRutaReal(true);
    });
    return () => { vigente = false; };
  }, [isLoaded, form.origen_lat, form.origen_lng, form.destino_lat, form.destino_lng]);

  const sugerenciasOrigen = UBICACIONES_CONOCIDAS.filter((u) => u.nombre.toLowerCase().includes(form.origen.toLowerCase()));
  const sugerenciasDestino = UBICACIONES_CONOCIDAS.filter((u) => u.nombre.toLowerCase().includes(form.destino.toLowerCase()));

  const choferesDisponibles = choferes.length > 0
    ? choferes.filter((c) => ["motorizado", "repartidor", "admin", "propietario", "cajero"].includes(c.cargo.toLowerCase()))
    : CHOFERES_SEED.filter((c) => c.cargo === "Repartidor" || c.cargo === "Administrador");

  const vehiculosDisponibles = vehiculos.length > 0 ? vehiculos : VEHICULOS_SEED;

  const estadosAlcanzables = TRANSICIONES_VALIDAS[form.estado];

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!form.cliente_nombre.trim() || !form.cliente_telefono.trim()) {
      setMsg({ tipo: "error", texto: "Nombre y Teléfono del cliente son obligatorios." });
      return;
    }
    if (!form.vehiculo_id) {
      setMsg({ tipo: "error", texto: "Debes asignar un vehículo al pedido." });
      return;
    }
    if (!form.chofer_cedula) {
      setMsg({ tipo: "error", texto: "Debes asignar un chofer/repartidor al pedido." });
      return;
    }
    if (!form.origen.trim() || form.origen_lat === null || form.origen_lng === null) {
      setMsg({ tipo: "error", texto: "Selecciona un Origen válido de la lista de sugerencias." });
      return;
    }
    if (!form.destino.trim() || form.destino_lat === null || form.destino_lng === null) {
      setMsg({ tipo: "error", texto: "Selecciona un Destino válido de la lista de sugerencias." });
      return;
    }

    const monto = Number(form.monto_total);
    if (Number.isNaN(monto) || monto <= 0) {
      setMsg({ tipo: "error", texto: "Monto Total debe ser un número válido mayor a 0." });
      return;
    }

    try {
      await apiClient.post("/api/v1/pedidos", {
        cliente_nombre: form.cliente_nombre.trim(),
        cliente_telefono: form.cliente_telefono.trim(),
        cliente_direccion: form.cliente_direccion.trim() || null,
        vehiculo_id: Number(form.vehiculo_id),
        chofer_cedula: form.chofer_cedula,
        origen: form.origen,
        origen_lat: form.origen_lat,
        origen_lng: form.origen_lng,
        destino: form.destino,
        destino_lat: form.destino_lat,
        destino_lng: form.destino_lng,
        distancia_km: form.distancia_km,
        eta_min: form.eta_min,
        estado: form.estado,
        metodo_pago: form.metodo_pago,
        monto_total: monto,
        notas: form.notas.trim() || null,
      });
      setMsg({ tipo: "ok", texto: "Pedido creado correctamente." });
      setForm(initialForm);
      if (onOrderCreated) {
        onOrderCreated();
      }
    } catch {
      setMsg({ tipo: "error", texto: "No se pudo crear el pedido." });
    }
  }

  return (
    <div className="p-6">
      <div className={cardCls}>
        <h2 className="text-3xl font-black tracking-tight text-slate-900">Nuevo Pedido de Delivery</h2>
        <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Logística, ruta y workflow de despacho</p>

        <MsgLine msg={msg} />

        <form onSubmit={guardar} className="mt-6 space-y-8">
          {/* --- Datos del Cliente --- */}
          <section>
            <h3 className={seccionCls}>Datos del Cliente</h3>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <label className="flex flex-col">
                <span className={labelCls}>Nombre del Cliente</span>
                <input className={inputCls} value={form.cliente_nombre} onChange={(e) => set("cliente_nombre", e.target.value)} required />
              </label>
              <label className="flex flex-col">
                <span className={labelCls}>Teléfono</span>
                <input className={inputCls} value={form.cliente_telefono} onChange={(e) => set("cliente_telefono", e.target.value)} placeholder="+584141234567" required />
              </label>
              <label className="col-span-2 flex flex-col">
                <span className={labelCls}>Dirección de Referencia</span>
                <input className={inputCls} value={form.cliente_direccion} onChange={(e) => set("cliente_direccion", e.target.value)} placeholder="Casa, color, punto de referencia..." />
              </label>
            </div>
          </section>

          {/* --- Asignación de Logística --- */}
          <section>
            <h3 className={seccionCls}>Asignación de Logística</h3>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <label className="flex flex-col">
                <span className={labelCls}>Vehículo Asignado</span>
                <select className={inputCls} value={form.vehiculo_id} onChange={(e) => set("vehiculo_id", e.target.value)} required>
                  <option value="">Seleccionar...</option>
                  {vehiculosDisponibles.map((v) => (
                    <option key={v.id} value={v.id}>{v.placa} · {v.tipo} · {v.marca} {v.modelo}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col">
                <span className={labelCls}>Chofer / Repartidor</span>
                <select className={inputCls} value={form.chofer_cedula} onChange={(e) => set("chofer_cedula", e.target.value)} required>
                  <option value="">Seleccionar...</option>
                  {choferesDisponibles.map((c) => (
                    <option key={c.cedula} value={c.cedula}>{c.nombre} ({c.cedula})</option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          {/* --- Ruta y Geolocalización --- */}
          <section>
            <h3 className={seccionCls}>Ruta y Geolocalización</h3>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <label className="relative flex flex-col">
                <span className={labelCls}>Punto de Origen</span>
                {tienePlaceAutocomplete ? (
                  <PlaceAutocompleteInput
                    className={inputCls}
                    placeholder="Buscar dirección de retiro (Google Maps)..."
                    onPlaceSelected={onPlaceOrigenSeleccionado}
                  />
                ) : (
                  <>
                    <input
                      className={inputCls}
                      value={form.origen}
                      onChange={(e) => onOrigenChange(e.target.value)}
                      onFocus={() => setSugerenciasOrigenVisibles(form.origen.trim().length > 0)}
                      placeholder="Buscar dirección de retiro..."
                      autoComplete="off"
                      required
                    />
                    {sugerenciasOrigenVisibles && form.origen_lat === null && sugerenciasOrigen.length > 0 && (
                      <ul className="absolute top-full z-10 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                        {sugerenciasOrigen.map((u) => (
                          <li key={u.nombre}>
                            <button
                              type="button"
                              onMouseDown={() => seleccionarOrigen(u)}
                              className="block w-full px-3 py-2 text-left text-sm text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                            >
                              📍 {u.nombre}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </label>
              <label className="relative flex flex-col">
                <span className={labelCls}>Punto de Destino</span>
                {tienePlaceAutocomplete ? (
                  <PlaceAutocompleteInput
                    className={inputCls}
                    placeholder="Buscar dirección de entrega (Google Maps)..."
                    onPlaceSelected={onPlaceDestinoSeleccionado}
                  />
                ) : (
                  <>
                    <input
                      className={inputCls}
                      value={form.destino}
                      onChange={(e) => onDestinoChange(e.target.value)}
                      onFocus={() => setSugerenciasDestinoVisibles(form.destino.trim().length > 0)}
                      placeholder="Buscar dirección de entrega..."
                      autoComplete="off"
                      required
                    />
                    {sugerenciasDestinoVisibles && form.destino_lat === null && sugerenciasDestino.length > 0 && (
                      <ul className="absolute top-full z-10 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                        {sugerenciasDestino.map((u) => (
                          <li key={u.nombre}>
                            <button
                              type="button"
                              onMouseDown={() => seleccionarDestino(u)}
                              className="block w-full px-3 py-2 text-left text-sm text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                            >
                              📍 {u.nombre}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </label>
            </div>

            {form.distancia_km !== null && form.eta_min !== null && esRutaReal && (
              <p className="mt-2 text-[10px] text-slate-400 font-medium">📡 Distancia y tiempo calculados con tráfico real de Google Maps.</p>
            )}

            {form.distancia_km !== null && form.eta_min !== null && (
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                  <p className={labelCls}>Distancia Estimada</p>
                  <p className="mt-1 text-2xl font-black tracking-tight text-blue-700">{form.distancia_km.toFixed(2)} km</p>
                </div>
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                  <p className={labelCls}>ETA Estimado</p>
                  <p className="mt-1 text-2xl font-black tracking-tight text-emerald-700">{form.eta_min} min</p>
                </div>
              </div>
            )}
          </section>

          {/* --- Workflow del Pedido --- */}
          <section>
            <h3 className={seccionCls}>Estado del Pedido (Workflow)</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {ESTADOS_PEDIDO.map((estado) => {
                const esActual = estado === form.estado;
                const esAlcanzable = estadosAlcanzables.includes(estado);
                const cfg = ESTADO_CONFIG[estado];
                return (
                  <button
                    key={estado}
                    type="button"
                    disabled={!esActual && !esAlcanzable}
                    onClick={() => set("estado", estado)}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors duration-300 ${
                      esActual ? cfg.activo : esAlcanzable ? cfg.inactivo : "cursor-not-allowed bg-slate-50 text-slate-300"
                    }`}
                  >
                    {cfg.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Desde "{ESTADO_CONFIG[form.estado].label}" solo se permite avanzar a los estados habilitados, respetando el flujo operativo del despacho.
            </p>
          </section>

          {/* --- Facturación y Notas --- */}
          <section>
            <h3 className={seccionCls}>Facturación y Notas</h3>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <label className="flex flex-col">
                <span className={labelCls}>Método de Pago</span>
                <select className={inputCls} value={form.metodo_pago} onChange={(e) => set("metodo_pago", e.target.value)}>
                  {METODOS_PAGO.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col">
                <span className={labelCls}>Monto Total ($)</span>
                <input type="number" step="0.01" min="0" className={inputCls} value={form.monto_total} onChange={(e) => set("monto_total", e.target.value)} placeholder="0.00" required />
              </label>
              <label className="col-span-2 flex flex-col">
                <span className={labelCls}>Notas Internas</span>
                <textarea className={inputCls} rows={3} value={form.notas} onChange={(e) => set("notas", e.target.value)} placeholder="Indicaciones especiales para el repartidor..." />
              </label>
            </div>
          </section>

          <button type="submit" className={btnCls}>Crear Pedido</button>
        </form>
      </div>
    </div>
  );
}
