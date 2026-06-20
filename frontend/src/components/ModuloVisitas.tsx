import { useState, useEffect, useRef } from "react";
import apiClient from "../api/client";

const INTERVALO_MINIMO_ENVIO_GPS_MS = 20000;

interface Cliente {
  id: number;
  nombre: string;
  cedula: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  lat?: number;
  lng?: number;
  foto_fachada_url?: string;
  limite_credito: number;
}

interface Producto {
  id: number;
  codigo_interno: string;
  nombre: string;
  precio_1_detalle: number;
  stock_total?: number;
}

interface ItemOrden {
  producto: Producto;
  cantidad: number;
  precio_unitario: number;
}

interface OrdenVentaItem {
  id: number;
  producto_id: number;
  producto_nombre?: string;
  cantidad: number;
  precio_unitario: number;
  monto_usd: number;
}

interface OrdenVenta {
  id: number;
  tipo: string;
  total_usd: number;
  estatus: string;
  notas?: string;
  created_at: string;
  items: OrdenVentaItem[];
}

interface VisitaCliente {
  id: number;
  fecha_visita: string;
  comentarios?: string;
  lat?: number;
  lng?: number;
  foto_visita_url?: string;
  encuesta?: {
    inventario_cliente?: string;
    rotacion_productos?: string;
    comentarios_adicionales?: string;
  };
}

export default function ModuloVisitas() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [activeTab, setActiveTab] = useState<"historial" | "orden" | "encuesta" | "editar">("historial");

  // Historial de visitas y órdenes del cliente seleccionado
  const [visitas, setVisitas] = useState<VisitaCliente[]>([]);
  const [ordenes, setOrdenes] = useState<OrdenVenta[]>([]);
  // Historial de compras reales (Tickets) y deuda/pagos (Cartera CxC) del cliente
  const [comprasTickets, setComprasTickets] = useState<any[]>([]);
  const [cuentasCxc, setCuentasCxc] = useState<any[]>([]);
  const [cxcDisponible, setCxcDisponible] = useState(true);

  // GPS real del check-in de la visita (independiente de las coordenadas del cliente)
  const [latVisitaActual, setLatVisitaActual] = useState<number | undefined>(undefined);
  const [lngVisitaActual, setLngVisitaActual] = useState<number | undefined>(undefined);
  const [gpsVisitaError, setGpsVisitaError] = useState("");

  // Formulario de nueva orden (Presupuesto / Backorder)
  const [cesta, setCesta] = useState<ItemOrden[]>([]);
  const [tipoOrden, setTipoOrden] = useState<"presupuesto" | "pedido">("presupuesto");
  const [notasOrden, setNotasOrden] = useState("");
  const [prodBusqueda, setProdBusqueda] = useState("");

  // Formulario de encuesta de marketing
  const [inventarioCliente, setInventarioCliente] = useState("");
  const [rotacionProductos, setRotacionProductos] = useState("");
  const [comentariosEncuesta, setComentariosEncuesta] = useState("");
  const [comentariosVisita, setComentariosVisita] = useState("");
  const [fotoVisita, setFotoVisita] = useState("");

  // Formulario de edición de cliente
  const [nombreCli, setNombreCli] = useState("");
  const [cedulaCli, setCedulaCli] = useState("");
  const [telefonoCli, setTelefonoCli] = useState("");
  const [emailCli, setEmailCli] = useState("");
  const [direccionCli, setDireccionCli] = useState("");
  const [latCli, setLatCli] = useState<number | undefined>(undefined);
  const [lngCli, setLngCli] = useState<number | undefined>(undefined);
  const [fotoFachadaCli, setFotoFachadaCli] = useState("");

  const [loading, setLoading] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  useEffect(() => {
    cargarClientes();
    cargarProductos();
  }, []);

  // Reporta la posición GPS real del vendedor cada ~20s mientras esta pantalla está abierta,
  // para que el gerente lo vea en tiempo real en "Agenda y Viáticos" / Dashboard. Antes de este
  // fix, nada llamaba a este endpoint y el mapa gerencial siempre quedaba vacío.
  const ultimoEnvioGpsRef = useRef<number>(0);
  useEffect(() => {
    if (!("geolocation" in navigator)) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const ahora = Date.now();
        if (ahora - ultimoEnvioGpsRef.current < INTERVALO_MINIMO_ENVIO_GPS_MS) return;
        ultimoEnvioGpsRef.current = ahora;
        apiClient.post("/api/v1/usuarios/gps", {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }).catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    if (clienteSeleccionado) {
      cargarHistorialCliente(clienteSeleccionado.id);
      // Reset forms
      setNombreCli(clienteSeleccionado.nombre);
      setCedulaCli(clienteSeleccionado.cedula);
      setTelefonoCli(clienteSeleccionado.telefono || "");
      setEmailCli(clienteSeleccionado.email || "");
      setDireccionCli(clienteSeleccionado.direccion || "");
      setLatCli(clienteSeleccionado.lat);
      setLngCli(clienteSeleccionado.lng);
      setFotoFachadaCli(clienteSeleccionado.foto_fachada_url || "");
      setCesta([]);
      setNotasOrden("");
      setInventarioCliente("");
      setRotacionProductos("");
      setComentariosEncuesta("");
      setComentariosVisita("");
      setFotoVisita("");
    }
  }, [clienteSeleccionado]);

  const cargarClientes = async () => {
    try {
      const res = await apiClient.get<Cliente[]>("/api/v1/clientes");
      setClientes(res.data);
    } catch {
      setClientes([]);
    }
  };

  const cargarProductos = async () => {
    try {
      const res = await apiClient.get<Producto[]>("/api/v1/productos");
      setProductos(res.data);
    } catch {
      setProductos([]);
    }
  };

  const cargarHistorialCliente = async (cid: number) => {
    setLoading(true);
    const [resVisitas, resOrdenes, resCompras, resCxc] = await Promise.allSettled([
      apiClient.get<VisitaCliente[]>(`/api/v1/visitas/cliente/${cid}`),
      apiClient.get<OrdenVenta[]>(`/api/v1/ventas/ordenes/cliente/${cid}`),
      apiClient.get<any[]>("/api/v1/tickets", { params: { cliente_id: cid, status: "procesado" } }),
      apiClient.get<any[]>("/api/v1/cartera/cxc", { params: { cliente_id: cid } }),
    ]);

    setVisitas(resVisitas.status === "fulfilled" ? resVisitas.value.data : []);
    setOrdenes(resOrdenes.status === "fulfilled" ? resOrdenes.value.data : []);
    setComprasTickets(
      resCompras.status === "fulfilled"
        ? resCompras.value.data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        : []
    );

    if (resCxc.status === "fulfilled") {
      setCuentasCxc(resCxc.value.data);
      setCxcDisponible(true);
    } else {
      setCuentasCxc([]);
      setCxcDisponible(false); // probablemente el rol actual (vendedor) no tiene permiso sobre Cartera
    }

    setLoading(false);
  };

  const agregarACesta = (prod: Producto) => {
    const existe = cesta.find((i) => i.producto.id === prod.id);
    if (existe) {
      setCesta(cesta.map((i) => i.producto.id === prod.id ? { ...i, cantidad: i.cantidad + 1 } : i));
    } else {
      setCesta([...cesta, { producto: prod, cantidad: 1, precio_unitario: prod.precio_1_detalle }]);
    }
  };

  const removerDeCesta = (pid: number) => {
    setCesta(cesta.filter((i) => i.producto.id !== pid));
  };

  const cambiarCantidadCesta = (pid: number, cant: number) => {
    if (cant <= 0) return;
    setCesta(cesta.map((i) => i.producto.id === pid ? { ...i, cantidad: cant } : i));
  };

  const calcularTotalCesta = () => {
    return cesta.reduce((acc, item) => acc + item.cantidad * item.precio_unitario, 0);
  };

  const enviarOrden = async () => {
    if (cesta.length === 0 || !clienteSeleccionado) return;
    setLoading(true);
    setMensaje(null);
    try {
      const itemsPayload = cesta.map((i) => ({
        producto_id: i.producto.id,
        cantidad: i.cantidad,
        precio_unitario: i.precio_unitario
      }));

      await apiClient.post("/api/v1/ventas/ordenes", {
        cliente_id: clienteSeleccionado.id,
        tipo: tipoOrden,
        notas: notasOrden,
        items: itemsPayload
      });

      setMensaje({ tipo: "ok", texto: `El ${tipoOrden} ha sido enviado con éxito.` });
      setCesta([]);
      setNotasOrden("");
      cargarHistorialCliente(clienteSeleccionado.id);
      setActiveTab("historial");
    } catch (err: any) {
      setMensaje({ tipo: "error", texto: err.response?.data?.detail || "No se pudo registrar la orden." });
    } finally {
      setLoading(false);
    }
  };

  const enviarVisitaYEncuesta = async () => {
    if (!clienteSeleccionado) return;
    setLoading(true);
    setMensaje(null);
    try {
      const payload = {
        cliente_id: clienteSeleccionado.id,
        comentarios: comentariosVisita,
        // GPS real del check-in (capturado al entrar a esta pestaña); si el navegador lo negó
        // o no respondió, se envía sin coordenadas en vez de inventar una ubicación falsa.
        lat: latVisitaActual,
        lng: lngVisitaActual,
        foto_visita_url: fotoVisita || "https://img.freepik.com/foto-gratis/almacen-tienda-industrial_1150-13612.jpg",
        encuesta: (inventarioCliente || rotacionProductos || comentariosEncuesta) ? {
          inventario_cliente: inventarioCliente,
          rotacion_productos: rotacionProductos,
          comentarios_adicionales: comentariosEncuesta
        } : undefined
      };

      await apiClient.post("/api/v1/visitas", payload);
      setMensaje({ tipo: "ok", texto: "Visita y Encuesta de marketing guardadas con éxito." });
      setComentariosVisita("");
      setInventarioCliente("");
      setRotacionProductos("");
      setComentariosEncuesta("");
      cargarHistorialCliente(clienteSeleccionado.id);
      setActiveTab("historial");
    } catch {
      setMensaje({ tipo: "error", texto: "No se pudo registrar la visita." });
    } finally {
      setLoading(false);
    }
  };

  // Captura la posición GPS real del dispositivo para el check-in de la visita (no la del cliente)
  const capturarGpsVisita = () => {
    setGpsVisitaError("");
    if (!navigator.geolocation) {
      setGpsVisitaError("Este dispositivo no soporta geolocalización. La visita se guardará sin coordenadas.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatVisitaActual(pos.coords.latitude);
        setLngVisitaActual(pos.coords.longitude);
      },
      () => {
        setGpsVisitaError("No se pudo obtener tu ubicación (permiso denegado o señal débil). La visita se guardará sin coordenadas de check-in.");
        setLatVisitaActual(undefined);
        setLngVisitaActual(undefined);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const capturarGpsCheckin = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLatCli(pos.coords.latitude);
          setLngCli(pos.coords.longitude);
          setMensaje({ tipo: "ok", texto: "Coordenadas GPS obtenidas del navegador con éxito." });
        },
        () => {
          // Fallback simulador
          setLatCli(10.4812);
          setLngCli(-66.9045);
          setMensaje({ tipo: "ok", texto: "Permiso GPS denegado. Se asignó ubicación demo en Barinas." });
        }
      );
    } else {
      setMensaje({ tipo: "error", texto: "Geolocalización no soportada por el navegador." });
    }
  };

  const guardarCambiosCliente = async () => {
    if (!clienteSeleccionado) return;
    setLoading(true);
    setMensaje(null);
    try {
      const res = await apiClient.put(`/api/v1/clientes/${clienteSeleccionado.id}`, {
        nombre: nombreCli,
        cedula: cedulaCli,
        telefono: telefonoCli,
        email: emailCli,
        direccion: direccionCli,
        lat: latCli,
        lng: lngCli,
        foto_fachada_url: fotoFachadaCli
      });
      setClienteSeleccionado(res.data);
      cargarClientes();
      setMensaje({ tipo: "ok", texto: "Ficha del cliente actualizada exitosamente." });
    } catch (err: any) {
      setMensaje({ tipo: "error", texto: err.response?.data?.detail || "No se pudo actualizar la ficha." });
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = productos.filter((p) =>
    p.nombre.toLowerCase().includes(prodBusqueda.toLowerCase()) ||
    p.codigo_interno.toLowerCase().includes(prodBusqueda.toLowerCase())
  );

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-emerald-950">Visita Clientes (Fuerza de Ventas)</h2>
          <p className="text-slate-500 text-sm">Navaja suiza para vendedores y representantes de agro-servicio comercial (RTC).</p>
        </div>
        
        {/* Selector de Cliente */}
        <div className="w-full md:w-80">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cliente a Visitar</label>
          <select
            className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            value={clienteSeleccionado?.id || ""}
            onChange={(e) => {
              const selected = clientes.find((c) => c.id === Number(e.target.value));
              setClienteSeleccionado(selected || null);
            }}
          >
            <option value="">-- Seleccionar Cliente --</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} ({c.cedula})
              </option>
            ))}
          </select>
        </div>
      </header>

      {mensaje && (
        <div className={`p-4 rounded-xl border text-sm font-semibold transition-all ${
          mensaje.tipo === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"
        }`}>
          {mensaje.texto}
        </div>
      )}

      {clienteSeleccionado ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Tarjeta de Resumen del Cliente */}
          <div className="space-y-6">
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="bg-emerald-800 p-6 text-white text-center relative">
                {clienteSeleccionado.foto_fachada_url ? (
                  <img
                    src={clienteSeleccionado.foto_fachada_url}
                    alt="Fachada Cliente"
                    className="w-24 h-24 rounded-full border-4 border-white/20 mx-auto object-cover object-center shadow-lg shadow-black/20"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full border-4 border-white/20 mx-auto flex items-center justify-center bg-emerald-900 text-3xl font-bold shadow-lg shadow-black/20">
                    🏢
                  </div>
                )}
                <h3 className="text-lg font-black mt-3 leading-tight">{clienteSeleccionado.nombre}</h3>
                <p className="text-xs text-emerald-200/90 font-medium tracking-wide mt-1">{clienteSeleccionado.cedula}</p>
              </div>

              <div className="p-6 space-y-4 text-xs font-semibold text-slate-700">
                <div className="flex items-center justify-between pb-2 border-b border-slate-50">
                  <span className="text-slate-400">Teléfono:</span>
                  <span>{clienteSeleccionado.telefono || "Sin registrar"}</span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b border-slate-50">
                  <span className="text-slate-400">Email:</span>
                  <span>{clienteSeleccionado.email || "Sin registrar"}</span>
                </div>
                <div className="flex flex-col gap-1 pb-2 border-b border-slate-50">
                  <span className="text-slate-400">Dirección:</span>
                  <span className="font-medium text-slate-600 leading-normal">{clienteSeleccionado.direccion || "Sin registrar"}</span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b border-slate-50">
                  <span className="text-slate-400">Ubicación GPS:</span>
                  <span>
                    {clienteSeleccionado.lat && clienteSeleccionado.lng 
                      ? `${clienteSeleccionado.lat.toFixed(4)}, ${clienteSeleccionado.lng.toFixed(4)}`
                      : "No sincronizado"
                    }
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2">
                  <span className="text-slate-400">Límite Crédito:</span>
                  <span className="text-emerald-700 text-sm font-black">${clienteSeleccionado.limite_credito.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Quick check-in GPS */}
            <button
              onClick={capturarGpsCheckin}
              className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-3 px-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-700/20 transition-all duration-300 transform active:scale-95 text-sm"
            >
              📍 Hacer Check-in GPS (Sincronizar Ubicación)
            </button>
          </div>

          {/* Menú de Tabs y Modos */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex rounded-2xl bg-slate-100 p-1">
              <button
                className={`flex-1 text-center py-2.5 rounded-xl font-bold text-xs transition-all duration-300 ${activeTab === "historial" ? "bg-white text-emerald-950 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
                onClick={() => setActiveTab("historial")}
              >
                📜 Historial
              </button>
              <button
                className={`flex-1 text-center py-2.5 rounded-xl font-bold text-xs transition-all duration-300 ${activeTab === "orden" ? "bg-white text-emerald-950 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
                onClick={() => setActiveTab("orden")}
              >
                🛒 Cesta de Presupuesto/Pedido
              </button>
              <button
                className={`flex-1 text-center py-2.5 rounded-xl font-bold text-xs transition-all duration-300 ${activeTab === "encuesta" ? "bg-white text-emerald-950 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
                onClick={() => { setActiveTab("encuesta"); capturarGpsVisita(); }}
              >
                📝 Encuesta Marketing
              </button>
              <button
                className={`flex-1 text-center py-2.5 rounded-xl font-bold text-xs transition-all duration-300 ${activeTab === "editar" ? "bg-white text-emerald-950 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
                onClick={() => setActiveTab("editar")}
              >
                🛠️ Editar Ficha
              </button>
            </div>

            {loading ? (
              <div className="text-center py-12 text-slate-400 font-medium text-sm">Cargando datos del cliente...</div>
            ) : (
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                
                {/* 1. Tab Historial */}
                {activeTab === "historial" && (
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">Historial de Compras Reales</h4>
                      {comprasTickets.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">Sin compras procesadas registradas para este cliente.</p>
                      ) : (
                        <div className="divide-y divide-slate-100 max-h-44 overflow-y-auto">
                          {comprasTickets.slice(0, 15).map((t) => (
                            <div key={t.id} className="flex justify-between items-center py-2 text-xs">
                              <span className="text-slate-500">{new Date(t.created_at).toLocaleDateString()}</span>
                              <span className="font-mono font-bold text-slate-700">${Number(t.monto_usd).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {cxcDisponible && (
                      <div className="border-t border-slate-100 pt-6">
                        <h4 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">Cartera (Deuda y Pagos)</h4>
                        {cuentasCxc.length === 0 ? (
                          <p className="text-xs text-slate-400 italic">Sin cuentas por cobrar registradas para este cliente.</p>
                        ) : (
                          <div className="divide-y divide-slate-100">
                            {cuentasCxc.map((c) => (
                              <div key={c.id} className="flex justify-between items-center py-2 text-xs">
                                <span className="text-slate-500">Vence {new Date(c.fecha_vencimiento).toLocaleDateString()} · {c.status}</span>
                                <span className={`font-mono font-bold ${c.status === "pagada" ? "text-emerald-600" : "text-rose-600"}`}>${Number(c.saldo).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="border-t border-slate-100 pt-6">
                      <h4 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">Historial de Órdenes y Cotizaciones</h4>
                      {ordenes.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">No hay órdenes registradas por vendedores para este cliente.</p>
                      ) : (
                        <div className="space-y-3">
                          {ordenes.map((o) => (
                            <div key={o.id} className="border border-slate-100 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-slate-200 transition-all bg-slate-50/50">
                              <div>
                                <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full ${o.tipo === "presupuesto" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>
                                  {o.tipo}
                                </span>
                                <h5 className="font-extrabold text-sm text-slate-900 mt-2">Orden #{o.id}</h5>
                                <p className="text-[10px] text-slate-400 font-medium mt-1">Generado: {new Date(o.created_at).toLocaleDateString()}</p>
                                {o.notas && <p className="text-xs text-slate-500 font-medium mt-1">Notas: {o.notas}</p>}
                                <ul className="mt-2 pl-4 list-disc text-xs text-slate-500 font-medium space-y-1">
                                  {o.items.map((i, idx) => (
                                    <li key={idx}>
                                      {i.producto_nombre || "Producto"}: {i.cantidad} x ${i.precio_unitario.toFixed(2)} = ${i.monto_usd.toFixed(2)}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                              <div className="text-right">
                                <p className="text-lg font-black text-slate-900">${o.total_usd.toFixed(2)}</p>
                                <span className={`inline-block mt-2 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                  o.estatus === "pendiente" ? "bg-amber-50 text-amber-700" : o.estatus === "aprobado" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                                }`}>
                                  {o.estatus}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="border-t border-slate-100 pt-6">
                      <h4 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">Visitas Anteriores</h4>
                      {visitas.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">No hay visitas de vendedores registradas.</p>
                      ) : (
                        <div className="space-y-3">
                          {visitas.map((v) => (
                            <div key={v.id} className="border border-slate-100 rounded-2xl p-4 hover:border-slate-200 transition-all bg-slate-50/50">
                              <div className="flex justify-between items-center pb-2 border-b border-slate-100 mb-2">
                                <span className="text-xs font-bold text-slate-500">📅 {new Date(v.fecha_visita).toLocaleString()}</span>
                                {v.lat && v.lng && (
                                  <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full">✓ Geolocalizado</span>
                                )}
                              </div>
                              <p className="text-xs text-slate-700 font-medium leading-relaxed">{v.comentarios || "Sin comentarios de avance."}</p>
                              {v.encuesta && (
                                <div className="mt-3 bg-emerald-50/30 border border-emerald-100/50 rounded-xl p-3 text-xs space-y-1.5">
                                  <p className="font-bold text-emerald-950">📋 Encuesta de Marketing:</p>
                                  <p><span className="text-slate-400 font-semibold">Inventario en Cliente:</span> <span className="font-semibold text-slate-600">{v.encuesta.inventario_cliente || "N/A"}</span></p>
                                  <p><span className="text-slate-400 font-semibold">Rotación de Productos:</span> <span className="font-semibold text-slate-600">{v.encuesta.rotacion_productos || "N/A"}</span></p>
                                  {v.encuesta.comentarios_adicionales && (
                                    <p><span className="text-slate-400 font-semibold">Notas:</span> <span className="font-semibold text-slate-600">{v.encuesta.comentarios_adicionales}</span></p>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 2. Tab Nueva Orden / Cesta */}
                {activeTab === "orden" && (
                  <div className="space-y-6">
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Buscar Producto</label>
                        <input
                          type="text"
                          className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
                          placeholder="Código o nombre del producto..."
                          value={prodBusqueda}
                          onChange={(e) => setProdBusqueda(e.target.value)}
                        />
                      </div>
                      <div className="w-48">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tipo de Documento</label>
                        <select
                          className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                          value={tipoOrden}
                          onChange={(e) => setTipoOrden(e.target.value as "presupuesto" | "pedido")}
                        >
                          <option value="presupuesto">Presupuesto (Cotización)</option>
                          <option value="pedido">Pedido (Backorder / Venta)</option>
                        </select>
                      </div>
                    </div>

                    {/* Catálogo rápido */}
                    {prodBusqueda && (
                      <div className="border border-slate-100 rounded-2xl max-h-40 overflow-y-auto divide-y divide-slate-50 p-2 shadow-inner">
                        {filteredProducts.map((p) => (
                          <div key={p.id} className="flex justify-between items-center py-2 px-3 text-xs font-semibold text-slate-700">
                            <span>{p.nombre} ({p.codigo_interno}) - <span className="text-emerald-700">${p.precio_1_detalle.toFixed(2)}</span></span>
                            <button
                              onClick={() => agregarACesta(p)}
                              className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-3 py-1 rounded-lg font-bold"
                            >
                              + Añadir
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Cesta actual */}
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Productos en Cesta</h4>
                      {cesta.length === 0 ? (
                        <p className="text-xs text-slate-400 italic py-6 text-center">La cesta está vacía. Busca y añade productos arriba.</p>
                      ) : (
                        <div className="space-y-2.5">
                          {cesta.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center border border-slate-100 rounded-xl p-3 bg-slate-50/30 text-xs font-semibold text-slate-800">
                              <div className="flex-1">
                                <p className="font-extrabold text-slate-900">{item.producto.nombre}</p>
                                <p className="text-slate-400 text-[10px] mt-0.5">Precio: ${item.producto.precio_1_detalle.toFixed(2)}</p>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white">
                                  <button
                                    onClick={() => cambiarCantidadCesta(item.producto.id, item.cantidad - 1)}
                                    className="px-2 py-1 bg-slate-50 text-slate-500 font-bold hover:bg-slate-100"
                                  >
                                    -
                                  </button>
                                  <input
                                    type="number"
                                    className="w-12 text-center text-xs font-bold border-none focus:outline-none py-1"
                                    value={item.cantidad}
                                    onChange={(e) => cambiarCantidadCesta(item.producto.id, Number(e.target.value))}
                                  />
                                  <button
                                    onClick={() => cambiarCantidadCesta(item.producto.id, item.cantidad + 1)}
                                    className="px-2 py-1 bg-slate-50 text-slate-500 font-bold hover:bg-slate-100"
                                  >
                                    +
                                  </button>
                                </div>
                                <span className="w-20 text-right font-black text-slate-900">${(item.cantidad * item.precio_unitario).toFixed(2)}</span>
                                <button
                                  onClick={() => removerDeCesta(item.producto.id)}
                                  className="text-red-500 hover:text-red-700 text-sm font-bold ml-2"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          ))}
                          
                          <div className="flex justify-between items-center pt-4 border-t border-slate-100 font-black text-slate-900">
                            <span className="text-sm">Total Estimado ({tipoOrden === "pedido" ? "Backorder" : "Cotización"}):</span>
                            <span className="text-xl text-emerald-800">${calcularTotalCesta().toFixed(2)}</span>
                          </div>

                          <div className="mt-4">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Notas de la Orden</label>
                            <textarea
                              rows={2}
                              className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
                              placeholder="Observaciones de entrega, crédito solicitado..."
                              value={notasOrden}
                              onChange={(e) => setNotasOrden(e.target.value)}
                            />
                          </div>

                          <button
                            onClick={enviarOrden}
                            disabled={cesta.length === 0 || loading}
                            className="w-full mt-4 bg-emerald-800 hover:bg-emerald-950 text-white font-bold py-2.5 rounded-xl shadow-lg shadow-emerald-800/10 transition-all text-xs"
                          >
                            {loading ? "Enviando..." : `Confirmar y Registrar ${tipoOrden === "pedido" ? "Backorder (Pedido)" : "Presupuesto (Cotización)"}`}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 3. Tab Encuesta de Marketing */}
                {activeTab === "encuesta" && (
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold uppercase tracking-wider text-emerald-950 mb-1">Encuesta de Rotación y Auditoría en Cliente</h4>
                    <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-4">Captura datos valiosos de mercado durante tu visita</p>
                    
                    <div className="space-y-4">
                      <label className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Comentarios Generales de la Visita (Log)</span>
                        <textarea
                          rows={2}
                          className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
                          placeholder="Resumen de la visita: qué hablaron, necesidades..."
                          value={comentariosVisita}
                          onChange={(e) => setComentariosVisita(e.target.value)}
                          required
                        />
                      </label>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className="flex flex-col">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Inventario del Cliente (Marcas/Cantidades)</span>
                          <textarea
                            rows={3}
                            className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
                            placeholder="Ej. Fertilizante NPK: 5 sacos, Insecticida: 10 litros."
                            value={inventarioCliente}
                            onChange={(e) => setInventarioCliente(e.target.value)}
                          />
                        </label>

                        <label className="flex flex-col">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Rotación observada de nuestros productos</span>
                          <textarea
                            rows={3}
                            className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
                            placeholder="Ej. Fertilizantes: lenta rotación, Semillas: rápida rotación."
                            value={rotacionProductos}
                            onChange={(e) => setRotacionProductos(e.target.value)}
                          />
                        </label>
                      </div>

                      <label className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Comentarios Adicionales y Competencia</span>
                        <textarea
                          rows={2}
                          className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
                          placeholder="Ej. Presencia de la marca Competidora X con precios 10% más bajos."
                          value={comentariosEncuesta}
                          onChange={(e) => setComentariosEncuesta(e.target.value)}
                        />
                      </label>

                      <label className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Foto Soporte de la Visita (URL Simulada)</span>
                        <input
                          type="text"
                          className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
                          placeholder="Dirección url de la imagen (dejar en blanco para usar demo)"
                          value={fotoVisita}
                          onChange={(e) => setFotoVisita(e.target.value)}
                        />
                      </label>

                      <div className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-[11px] font-semibold ${
                        gpsVisitaError ? "bg-amber-50 text-amber-700" : latVisitaActual ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-500"
                      }`}>
                        <span>
                          {gpsVisitaError
                            ? `⚠️ ${gpsVisitaError}`
                            : latVisitaActual
                            ? `✓ Check-in geolocalizado (${latVisitaActual.toFixed(4)}, ${lngVisitaActual?.toFixed(4)})`
                            : "📡 Obteniendo tu ubicación GPS para el check-in..."}
                        </span>
                        <button type="button" onClick={capturarGpsVisita} className="underline shrink-0">Reintentar</button>
                      </div>

                      <button
                        onClick={enviarVisitaYEncuesta}
                        disabled={!comentariosVisita.trim() || loading}
                        className="w-full bg-emerald-800 hover:bg-emerald-950 text-white font-bold py-2.5 rounded-xl shadow-lg shadow-emerald-800/10 transition-all text-xs"
                      >
                        {loading ? "Guardando..." : "Registrar Visita y Encuesta de Marketing"}
                      </button>
                    </div>
                  </div>
                )}

                {/* 4. Tab Editar Ficha Cliente */}
                {activeTab === "editar" && (
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold uppercase tracking-wider text-emerald-950 mb-3">Editar Información General de Cliente</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <label className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Nombre / Razón Social</span>
                        <input
                          type="text"
                          className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
                          value={nombreCli}
                          onChange={(e) => setNombreCli(e.target.value)}
                        />
                      </label>
                      <label className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cédula / RIF</span>
                        <input
                          type="text"
                          className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
                          value={cedulaCli}
                          onChange={(e) => setCedulaCli(e.target.value)}
                        />
                      </label>
                      <label className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Teléfono</span>
                        <input
                          type="text"
                          className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
                          value={telefonoCli}
                          onChange={(e) => setTelefonoCli(e.target.value)}
                        />
                      </label>
                      <label className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Email</span>
                        <input
                          type="email"
                          className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
                          value={emailCli}
                          onChange={(e) => setEmailCli(e.target.value)}
                        />
                      </label>
                      <label className="col-span-1 md:col-span-2 flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Dirección</span>
                        <textarea
                          rows={2}
                          className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
                          value={direccionCli}
                          onChange={(e) => setDireccionCli(e.target.value)}
                        />
                      </label>
                      <label className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Latitud</span>
                        <input
                          type="number"
                          step="any"
                          className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
                          value={latCli || ""}
                          onChange={(e) => setLatCli(e.target.value ? Number(e.target.value) : undefined)}
                        />
                      </label>
                      <label className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Longitud</span>
                        <input
                          type="number"
                          step="any"
                          className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
                          value={lngCli || ""}
                          onChange={(e) => setLngCli(e.target.value ? Number(e.target.value) : undefined)}
                        />
                      </label>
                      <label className="col-span-1 md:col-span-2 flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Foto de Fachada (URL)</span>
                        <input
                          type="text"
                          className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
                          value={fotoFachadaCli}
                          onChange={(e) => setFotoFachadaCli(e.target.value)}
                          placeholder="URL de la foto de la fachada del local"
                        />
                      </label>
                    </div>

                    <button
                      onClick={guardarCambiosCliente}
                      disabled={loading}
                      className="w-full mt-4 bg-emerald-800 hover:bg-emerald-950 text-white font-bold py-2.5 rounded-xl shadow-lg shadow-emerald-800/10 transition-all text-xs"
                    >
                      {loading ? "Guardando..." : "Guardar Cambios en la Ficha del Cliente"}
                    </button>
                  </div>
                )}

              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-12 text-center text-slate-400 font-semibold text-sm">
          💡 Por favor, selecciona un cliente en la parte superior derecha para comenzar su visita y ver su historial de compra/pagos.
        </div>
      )}
    </div>
  );
}
