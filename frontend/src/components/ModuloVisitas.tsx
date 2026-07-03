import { useState, useEffect, useRef } from "react";
import apiClient from "../api/client";
import { useOfflineSync } from "../hooks/useOfflineSync";

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
  codigo_barras?: string | null;
  nombre: string;
  precio_1_detalle: number;
  stock_total?: number;
}

interface EncuestaItemForm {
  producto: Producto;
  stock_observado: number;
  tiene_queja: boolean;
  detalle_queja: string;
}

interface StockCeroItem {
  producto_id: number;
  codigo: string;
  nombre: string;
  stock_observado: number;
  creado_en: string;
}

interface FacturaItem {
  producto_id: number;
  codigo: string;
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  total_linea: number;
}

interface Factura {
  id: number;
  numero: string;
  numero_factura_a2?: string | null;
  fecha_emision: string;
  total_usd: number;
  items: FacturaItem[];
}

interface RankingItem {
  producto_id: number;
  codigo: string;
  nombre: string;
  total_cantidad: number;
  total_monto: number;
  num_facturas: number;
}

interface ProyeccionItem {
  producto_id: number;
  codigo: string;
  nombre: string;
  num_compras: number;
  cantidad_promedio: number;
  intervalo_promedio_dias?: number | null;
  ultima_compra: string;
  proxima_compra_esperada?: string | null;
  stock_observado_actual?: number | null;
  recomendado_reponer_ahora: boolean;
}

interface PendienteCobro {
  id: number;
  numero_doc: string;
  fecha_vencimiento: string;
  saldo_usd: number;
  vencida: boolean;
}

interface PagoReciente {
  fecha: string;
  monto: number;
  metodo: string;
  estado: string;
}

interface HistorialPago {
  cliente_id: number;
  pendientes: PendienteCobro[];
  pagos_recientes: PagoReciente[];
  requiere_cuestionario_cobranza: boolean;
}

interface ItemOrden {
  producto: Producto;
  cantidad: number;
  precio_unitario: number;
}

type TabKey = "encuesta" | "stockCero" | "compra" | "pago" | "presupuesto" | "datos";

export default function ModuloVisitas() {
  const { guardarTransaccionOffline } = useOfflineSync();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("encuesta");
  const [loadingCliente, setLoadingCliente] = useState(false);
  const [loadingAccion, setLoadingAccion] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  // Selector de cliente: autocomplete en memoria, sin selects gigantes
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [mostrarDropdownCliente, setMostrarDropdownCliente] = useState(false);

  // Bloques cargados en paralelo al seleccionar cliente
  const [stockCero, setStockCero] = useState<StockCeroItem[]>([]);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [proyeccion, setProyeccion] = useState<ProyeccionItem[]>([]);
  const [historialPago, setHistorialPago] = useState<HistorialPago | null>(null);
  const [facturaExpandida, setFacturaExpandida] = useState<number | null>(null);

  // Encuesta de Inventario (acción principal)
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [itemsEncuesta, setItemsEncuesta] = useState<EncuestaItemForm[]>([]);
  const [latEncuesta, setLatEncuesta] = useState<number | undefined>(undefined);
  const [lngEncuesta, setLngEncuesta] = useState<number | undefined>(undefined);

  // Cuestionario de cobranza (se activa por contexto, no por navegación manual)
  const [respuestaCobranza, setRespuestaCobranza] = useState("");
  const [gestionEfectiva, setGestionEfectiva] = useState(false);

  // Toma de Presupuesto (cesta)
  const [cesta, setCesta] = useState<ItemOrden[]>([]);
  const [tipoOrden, setTipoOrden] = useState<"presupuesto" | "pedido">("presupuesto");
  const [notasOrden, setNotasOrden] = useState("");
  const [prodBusquedaCesta, setProdBusquedaCesta] = useState("");

  // Datos del Cliente (edición rápida)
  const [nombreCli, setNombreCli] = useState("");
  const [cedulaCli, setCedulaCli] = useState("");
  const [telefonoCli, setTelefonoCli] = useState("");
  const [emailCli, setEmailCli] = useState("");
  const [direccionCli, setDireccionCli] = useState("");

  useEffect(() => {
    cargarClientes();
    cargarProductos();
  }, []);

  // Reporta la posición GPS real del vendedor cada ~20s mientras esta pantalla está abierta,
  // para que el gerente lo vea en tiempo real en "Agenda y Viáticos" / Dashboard.
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

  // GPS opcional para la encuesta: nunca bloquea el guardado si el dispositivo lo niega.
  const capturarGpsEncuesta = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatEncuesta(pos.coords.latitude);
        setLngEncuesta(pos.coords.longitude);
      },
      () => {
        setLatEncuesta(undefined);
        setLngEncuesta(undefined);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const seleccionarCliente = async (cliente: Cliente) => {
    setClienteSeleccionado(cliente);
    setBusquedaCliente("");
    setMostrarDropdownCliente(false);
    setActiveTab("encuesta");
    setMensaje(null);

    setItemsEncuesta([]);
    setBusquedaProducto("");
    setRespuestaCobranza("");
    setGestionEfectiva(false);
    setCesta([]);
    setNotasOrden("");
    setNombreCli(cliente.nombre);
    setCedulaCli(cliente.cedula);
    setTelefonoCli(cliente.telefono || "");
    setEmailCli(cliente.email || "");
    setDireccionCli(cliente.direccion || "");
    capturarGpsEncuesta();

    await cargarTodoElCliente(cliente.id);
  };

  // Toda la pantalla carga de una vez: las 5 consultas se disparan en paralelo, el vendedor
  // no debe esperar a que cada pestaña haga su propio fetch.
  const cargarTodoElCliente = async (clienteId: number) => {
    setLoadingCliente(true);
    const [resStockCero, resCompra, resRanking, resProyeccion, resPago] = await Promise.allSettled([
      apiClient.get<StockCeroItem[]>(`/api/v1/visita-cliente/clientes/${clienteId}/stock-cero`),
      apiClient.get<Factura[]>(`/api/v1/visita-cliente/clientes/${clienteId}/historial-compra`),
      apiClient.get<RankingItem[]>(`/api/v1/visita-cliente/clientes/${clienteId}/ranking-productos`),
      apiClient.get<ProyeccionItem[]>(`/api/v1/visita-cliente/clientes/${clienteId}/proyeccion-reposicion`),
      apiClient.get<HistorialPago>(`/api/v1/visita-cliente/clientes/${clienteId}/historial-pago`),
    ]);

    setStockCero(resStockCero.status === "fulfilled" ? resStockCero.value.data : []);
    setFacturas(resCompra.status === "fulfilled" ? resCompra.value.data : []);
    setRanking(resRanking.status === "fulfilled" ? resRanking.value.data : []);
    setProyeccion(resProyeccion.status === "fulfilled" ? resProyeccion.value.data : []);
    setHistorialPago(resPago.status === "fulfilled" ? resPago.value.data : null);
    setLoadingCliente(false);
  };

  const refrescarStockCero = async () => {
    if (!clienteSeleccionado) return;
    try {
      const res = await apiClient.get<StockCeroItem[]>(`/api/v1/visita-cliente/clientes/${clienteSeleccionado.id}/stock-cero`);
      setStockCero(res.data);
    } catch {
      // No bloqueante: la encuesta ya se guardó, solo falló el refresco de este bloque.
    }
  };

  // --- Encuesta de Inventario ---

  const agregarProductoEncuesta = (prod: Producto) => {
    if (itemsEncuesta.some((i) => i.producto.id === prod.id)) return;
    setItemsEncuesta([...itemsEncuesta, {
      producto: prod,
      stock_observado: prod.stock_total ?? 0,
      tiene_queja: false,
      detalle_queja: "",
    }]);
    setBusquedaProducto("");
  };

  const actualizarItemEncuesta = (productoId: number, cambios: Partial<EncuestaItemForm>) => {
    setItemsEncuesta(itemsEncuesta.map((i) => i.producto.id === productoId ? { ...i, ...cambios } : i));
  };

  const quitarItemEncuesta = (productoId: number) => {
    setItemsEncuesta(itemsEncuesta.filter((i) => i.producto.id !== productoId));
  };

  const guardarEncuesta = async () => {
    if (!clienteSeleccionado || itemsEncuesta.length === 0) return;
    setLoadingAccion(true);
    setMensaje(null);
    try {
      await apiClient.post("/api/v1/visita-cliente/encuesta", {
        cliente_id: clienteSeleccionado.id,
        items: itemsEncuesta.map((i) => ({
          producto_id: i.producto.id,
          stock_observado: i.stock_observado,
          tiene_queja: i.tiene_queja,
          detalle_queja: i.tiene_queja ? (i.detalle_queja || null) : null,
        })),
        lat: latEncuesta,
        lng: lngEncuesta,
      });
      setMensaje({ tipo: "ok", texto: "Encuesta de inventario guardada con éxito." });
      setItemsEncuesta([]);
      refrescarStockCero();
    } catch (err: any) {
      // Control de contingencia offline: si el error es de conexión o no hay respuesta
      const esErrorDeRed = !err.response || err.message === "Network Error";
      if (esErrorDeRed && clienteSeleccionado) {
        try {
          const inventarioResumen = itemsEncuesta.map(i => `${i.producto.nombre}: ${i.stock_observado}u`).join(", ");
          const quejasResumen = itemsEncuesta.filter(i => i.tiene_queja).map(i => `${i.producto.nombre}: ${i.detalle_queja}`).join("; ");
          
          guardarTransaccionOffline("visita", {
            cliente_id: clienteSeleccionado.id,
            cliente_cedula_rif: clienteSeleccionado.cedula,
            fecha_visita: new Date().toISOString(),
            comentarios: `Encuesta Offline. Inventario: [${inventarioResumen}]` + (quejasResumen ? ` Quejas: [${quejasResumen}]` : ""),
            encuesta: {
              inventario_cliente: inventarioResumen,
              rotacion_productos: "Normal"
            }
          });
          
          setMensaje({ tipo: "ok", texto: "Encuesta guardada localmente (Offline). Se sincronizará automáticamente." });
          setItemsEncuesta([]);
          return;
        } catch (offlineErr) {
          console.error("Error al registrar encuesta offline:", offlineErr);
        }
      }
      setMensaje({ tipo: "error", texto: err.response?.data?.detail || "No se pudo guardar la encuesta." });
    } finally {
      setLoadingAccion(false);
    }
  };

  const productosFiltrados = productos.filter((p) =>
    !itemsEncuesta.some((i) => i.producto.id === p.id) &&
    (p.nombre.toLowerCase().includes(busquedaProducto.toLowerCase()) ||
      p.codigo_interno.toLowerCase().includes(busquedaProducto.toLowerCase()))
  ).slice(0, 8);

  // --- Cobranza en contexto ---

  const enviarGestionCobranza = async () => {
    if (!clienteSeleccionado || !respuestaCobranza.trim()) return;
    setLoadingAccion(true);
    setMensaje(null);
    try {
      const resGestion = await apiClient.post<{ gestion_id: number }>("/api/v1/cobranzas/gestion-cobranza", {
        cliente_id: clienteSeleccionado.id,
        tipo: "VISITA",
      });
      await apiClient.put(`/api/v1/cobranzas/gestion-cobranza/${resGestion.data.gestion_id}/respuesta`, {
        respuesta_cliente: respuestaCobranza,
        efectiva: gestionEfectiva,
      });
      setMensaje({ tipo: "ok", texto: "Gestión de cobranza registrada con éxito." });
      setRespuestaCobranza("");
      setGestionEfectiva(false);
    } catch (err: any) {
      setMensaje({ tipo: "error", texto: err.response?.data?.detail || "No se pudo registrar la gestión de cobranza." });
    } finally {
      setLoadingAccion(false);
    }
  };

  // --- Toma de Presupuesto ---

  const agregarACesta = (prod: Producto) => {
    const existe = cesta.find((i) => i.producto.id === prod.id);
    if (existe) {
      setCesta(cesta.map((i) => i.producto.id === prod.id ? { ...i, cantidad: i.cantidad + 1 } : i));
    } else {
      setCesta([...cesta, { producto: prod, cantidad: 1, precio_unitario: prod.precio_1_detalle }]);
    }
  };

  const removerDeCesta = (pid: number) => setCesta(cesta.filter((i) => i.producto.id !== pid));

  const cambiarCantidadCesta = (pid: number, cant: number) => {
    if (cant <= 0) return;
    setCesta(cesta.map((i) => i.producto.id === pid ? { ...i, cantidad: cant } : i));
  };

  const totalCesta = cesta.reduce((acc, item) => acc + item.cantidad * item.precio_unitario, 0);

  const enviarOrden = async () => {
    if (cesta.length === 0 || !clienteSeleccionado) return;
    setLoadingAccion(true);
    setMensaje(null);
    try {
      await apiClient.post("/api/v1/ventas/ordenes", {
        cliente_id: clienteSeleccionado.id,
        tipo: tipoOrden,
        notas: notasOrden,
        items: cesta.map((i) => ({
          producto_id: i.producto.id,
          cantidad: i.cantidad,
          precio_unitario: i.precio_unitario,
        })),
      });
      setMensaje({ tipo: "ok", texto: `El ${tipoOrden} ha sido enviado con éxito.` });
      setCesta([]);
      setNotasOrden("");
    } catch (err: any) {
      // Control de contingencia offline: si el error es de conexión o no hay respuesta
      const esErrorDeRed = !err.response || err.message === "Network Error";
      if (esErrorDeRed && clienteSeleccionado) {
        try {
          // El vendedor puede tomar órdenes offline. Se guardan en la cola local
          for (const item of cesta) {
            guardarTransaccionOffline("ticket", {
              producto_id: item.producto.id,
              producto_codigo_barras: item.producto.codigo_barras || null,
              cliente_id: clienteSeleccionado.id,
              cliente_cedula_rif: clienteSeleccionado.cedula,
              cantidad: item.cantidad,
              precio_unitario_usd: item.precio_unitario,
              monto_usd: item.precio_unitario * item.cantidad,
              status: "procesado"
            });
          }
          setMensaje({ tipo: "ok", texto: `El ${tipoOrden} ha sido guardado localmente (Offline). Se sincronizará automáticamente.` });
          setCesta([]);
          setNotasOrden("");
          return;
        } catch (offlineErr) {
          console.error("Error al registrar orden offline:", offlineErr);
        }
      }
      setMensaje({ tipo: "error", texto: err.response?.data?.detail || "No se pudo registrar la orden." });
    } finally {
      setLoadingAccion(false);
    }
  };

  const productosFiltradosCesta = productos.filter((p) =>
    p.nombre.toLowerCase().includes(prodBusquedaCesta.toLowerCase()) ||
    p.codigo_interno.toLowerCase().includes(prodBusquedaCesta.toLowerCase())
  ).slice(0, 8);

  // --- Datos del Cliente ---

  const guardarCambiosCliente = async () => {
    if (!clienteSeleccionado) return;
    setLoadingAccion(true);
    setMensaje(null);
    try {
      const res = await apiClient.put(`/api/v1/clientes/${clienteSeleccionado.id}`, {
        nombre: nombreCli,
        cedula: cedulaCli,
        telefono: telefonoCli,
        email: emailCli,
        direccion: direccionCli,
      });
      setClienteSeleccionado(res.data);
      cargarClientes();
      setMensaje({ tipo: "ok", texto: "Ficha del cliente actualizada exitosamente." });
    } catch (err: any) {
      setMensaje({ tipo: "error", texto: err.response?.data?.detail || "No se pudo actualizar la ficha." });
    } finally {
      setLoadingAccion(false);
    }
  };

  const resultadosBusquedaCliente = busquedaCliente.trim()
    ? clientes.filter((c) =>
        c.nombre.toLowerCase().includes(busquedaCliente.toLowerCase()) ||
        c.cedula.toLowerCase().includes(busquedaCliente.toLowerCase())
      ).slice(0, 8)
    : [];

  const tieneVencidas = !!historialPago?.pendientes.some((p) => p.vencida);

  const TABS: { key: TabKey; icon: string; label: string }[] = [
    { key: "encuesta", icon: "📋", label: "Encuesta de Inventario" },
    { key: "stockCero", icon: "🚫", label: "Stock Cero" },
    { key: "compra", icon: "📈", label: "Historial de Compra" },
    { key: "pago", icon: "💳", label: "Historial de Pago" },
    { key: "presupuesto", icon: "🧾", label: "Toma de Presupuesto" },
    { key: "datos", icon: "🛠️", label: "Datos del Cliente" },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-emerald-950">Visita Cliente</h2>
          <p className="text-slate-500 text-sm">Expediente 360° del cliente en terreno: registra, consulta y cotiza desde una sola pantalla.</p>
        </div>

        {/* Selector de Cliente: autocomplete en memoria */}
        <div className="w-full md:w-80 relative">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Buscar Cliente</label>
          <input
            type="text"
            className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            placeholder="Nombre o código del cliente..."
            value={clienteSeleccionado && !busquedaCliente ? `${clienteSeleccionado.nombre} (${clienteSeleccionado.cedula})` : busquedaCliente}
            onChange={(e) => {
              setBusquedaCliente(e.target.value);
              setMostrarDropdownCliente(true);
              setClienteSeleccionado(null);
            }}
            onFocus={() => setMostrarDropdownCliente(true)}
          />
          {mostrarDropdownCliente && resultadosBusquedaCliente.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
              {resultadosBusquedaCliente.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-emerald-50 border-b border-slate-50 last:border-0"
                  onClick={() => seleccionarCliente(c)}
                >
                  {c.nombre} <span className="text-slate-400">({c.cedula})</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {mensaje && (
        <div className={`p-4 rounded-xl border text-sm font-semibold transition-all ${
          mensaje.tipo === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"
        }`}>
          {mensaje.texto}
        </div>
      )}

      {!clienteSeleccionado ? (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-12 text-center text-slate-400 font-semibold text-sm">
          💡 Busca y selecciona un cliente arriba para comenzar su visita.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Tarjeta de Resumen del Cliente */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {clienteSeleccionado.foto_fachada_url ? (
                <img src={clienteSeleccionado.foto_fachada_url} alt="Fachada" className="w-14 h-14 rounded-full object-cover border-2 border-emerald-100" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-emerald-800 text-white flex items-center justify-center text-xl font-bold">🏢</div>
              )}
              <div>
                <h3 className="font-black text-slate-900 text-lg leading-tight">{clienteSeleccionado.nombre}</h3>
                <p className="text-xs text-slate-400 font-semibold">{clienteSeleccionado.cedula} · {clienteSeleccionado.telefono || "Sin teléfono"}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Límite de Crédito</p>
              <p className="text-lg font-black text-emerald-700">${Number(clienteSeleccionado.limite_credito).toFixed(2)}</p>
            </div>
          </div>

          {/* Tabs horizontales */}
          <div className="flex flex-wrap rounded-2xl bg-slate-100 p-1 gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                className={`flex-1 min-w-[120px] text-center py-2.5 rounded-xl font-bold text-xs transition-all duration-300 relative ${
                  activeTab === t.key ? "bg-white text-emerald-950 shadow-sm" : "text-slate-500 hover:text-slate-900"
                }`}
                onClick={() => setActiveTab(t.key)}
              >
                {t.icon} {t.label}
                {t.key === "pago" && tieneVencidas && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-rose-500 border-2 border-white" />
                )}
              </button>
            ))}
          </div>

          {loadingCliente ? (
            <div className="text-center py-12 text-slate-400 font-medium text-sm">Cargando expediente del cliente...</div>
          ) : (
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">

              {/* 1. Encuesta de Inventario */}
              {activeTab === "encuesta" && (
                <div className="space-y-4">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-emerald-950">Encuesta de Inventario y Quejas</h4>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
                    placeholder="Buscar producto por código o nombre..."
                    value={busquedaProducto}
                    onChange={(e) => setBusquedaProducto(e.target.value)}
                  />
                  {busquedaProducto && (
                    <div className="border border-slate-100 rounded-2xl max-h-40 overflow-y-auto divide-y divide-slate-50 p-2 shadow-inner">
                      {productosFiltrados.map((p) => (
                        <div key={p.id} className="flex justify-between items-center py-2 px-3 text-xs font-semibold text-slate-700">
                          <span>{p.nombre} ({p.codigo_interno})</span>
                          <button onClick={() => agregarProductoEncuesta(p)} className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-3 py-1 rounded-lg font-bold">
                            + Añadir
                          </button>
                        </div>
                      ))}
                      {productosFiltrados.length === 0 && <p className="text-xs text-slate-400 italic px-3 py-2">Sin coincidencias.</p>}
                    </div>
                  )}

                  {itemsEncuesta.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-6 text-center">Busca productos arriba para registrar el stock visto y quejas.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {itemsEncuesta.map((item) => (
                        <div key={item.producto.id} className="border border-slate-100 rounded-xl p-3 bg-slate-50/30 space-y-2">
                          <div className="flex justify-between items-center gap-3">
                            <span className="font-extrabold text-sm text-slate-900 flex-1">{item.producto.nombre}</span>
                            <label className="text-[10px] font-bold uppercase text-slate-400">Stock visto</label>
                            <input
                              type="number"
                              step="any"
                              aria-label="Stock visto"
                              className="w-24 text-center text-xs font-bold border border-slate-200 rounded-lg py-1"
                              value={item.stock_observado}
                              onChange={(e) => actualizarItemEncuesta(item.producto.id, { stock_observado: Number(e.target.value) })}
                            />
                            <button onClick={() => quitarItemEncuesta(item.producto.id)} className="text-red-500 hover:text-red-700 text-sm font-bold">✕</button>
                          </div>
                          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                            <input
                              type="checkbox"
                              checked={item.tiene_queja}
                              onChange={(e) => actualizarItemEncuesta(item.producto.id, { tiene_queja: e.target.checked })}
                            />
                            Tiene queja
                          </label>
                          {item.tiene_queja && (
                            <input
                              type="text"
                              className="w-full rounded-lg border border-amber-200 px-3 py-1.5 text-xs bg-amber-50"
                              placeholder="Detalle de la queja (ej. llegó vencido)..."
                              value={item.detalle_queja}
                              onChange={(e) => actualizarItemEncuesta(item.producto.id, { detalle_queja: e.target.value })}
                            />
                          )}
                        </div>
                      ))}
                      <button
                        onClick={guardarEncuesta}
                        disabled={loadingAccion}
                        className="w-full mt-2 bg-emerald-800 hover:bg-emerald-950 text-white font-bold py-2.5 rounded-xl shadow-lg shadow-emerald-800/10 transition-all text-xs"
                      >
                        {loadingAccion ? "Guardando..." : "Guardar Encuesta"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* 2. Stock Cero */}
              {activeTab === "stockCero" && (
                <div className="space-y-3">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-emerald-950">Productos en Stock Cero (Pendientes a Retomar)</h4>
                  {stockCero.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-6 text-center">Sin productos en cero reportados para este cliente.</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-slate-400 uppercase text-[10px] font-bold border-b border-slate-100">
                          <th className="py-2">Código</th><th>Producto</th><th>Reportado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {stockCero.map((s) => (
                          <tr key={s.producto_id} className="font-semibold text-slate-700">
                            <td className="py-2">{s.codigo}</td>
                            <td>{s.nombre}</td>
                            <td className="text-slate-400">{new Date(s.creado_en).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* 3. Historial de Compra */}
              {activeTab === "compra" && (
                <div className="space-y-8">
                  <div>
                    <h4 className="text-sm font-bold uppercase tracking-wider text-emerald-950 mb-3">Recomendación de Reposición</h4>
                    {proyeccion.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">Sin histórico de compras suficiente para proyectar.</p>
                    ) : (
                      <div className="space-y-2">
                        {proyeccion.map((p) => (
                          <div key={p.producto_id} className={`flex justify-between items-center p-3 rounded-xl text-xs font-semibold ${
                            p.recomendado_reponer_ahora ? "bg-amber-50 border border-amber-200" : "bg-slate-50 border border-slate-100"
                          }`}>
                            <div>
                              <p className="font-extrabold text-slate-900">{p.nombre} <span className="text-slate-400">({p.codigo})</span></p>
                              <p className="text-slate-500 mt-0.5">
                                Compra prom. {Number(p.cantidad_promedio).toFixed(2)} c/{p.intervalo_promedio_dias ? Math.round(p.intervalo_promedio_dias) : "?"} días ·
                                Última: {new Date(p.ultima_compra).toLocaleDateString()}
                                {p.proxima_compra_esperada && <> · Próxima esperada: {new Date(p.proxima_compra_esperada).toLocaleDateString()}</>}
                              </p>
                            </div>
                            <div className="text-right shrink-0 ml-3">
                              <p className="text-slate-400">Stock visto: {p.stock_observado_actual != null ? Number(p.stock_observado_actual).toFixed(2) : "N/D"}</p>
                              {p.recomendado_reponer_ahora && <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 text-[10px] font-black uppercase">Reponer ahora</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-100 pt-6">
                    <h4 className="text-sm font-bold uppercase tracking-wider text-emerald-950 mb-3">Ranking de Productos Comprados</h4>
                    {ranking.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">Sin compras registradas.</p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-slate-400 uppercase text-[10px] font-bold border-b border-slate-100">
                            <th className="py-2">#</th><th>Producto</th><th>Cantidad</th><th>Monto</th><th>N° Facturas</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {ranking.map((r, idx) => (
                            <tr key={r.producto_id} className="font-semibold text-slate-700">
                              <td className="py-2">{idx + 1}</td>
                              <td>{r.nombre} <span className="text-slate-400">({r.codigo})</span></td>
                              <td>{Number(r.total_cantidad).toFixed(2)}</td>
                              <td className="font-mono">${Number(r.total_monto).toFixed(2)}</td>
                              <td>{r.num_facturas}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  <div className="border-t border-slate-100 pt-6">
                    <h4 className="text-sm font-bold uppercase tracking-wider text-emerald-950 mb-3">Facturas</h4>
                    {facturas.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">Sin facturas registradas para este cliente.</p>
                    ) : (
                      <div className="space-y-2">
                        {facturas.map((f) => (
                          <div key={f.id} className="border border-slate-100 rounded-2xl overflow-hidden">
                            <button
                              className="w-full flex justify-between items-center p-3 bg-slate-50/50 hover:bg-slate-100/50 text-xs font-bold"
                              onClick={() => setFacturaExpandida(facturaExpandida === f.id ? null : f.id)}
                            >
                              <span>{f.numero} · {new Date(f.fecha_emision).toLocaleString()}</span>
                              <span className="font-mono text-slate-900">${Number(f.total_usd).toFixed(2)}</span>
                            </button>
                            {facturaExpandida === f.id && (
                              <div className="p-3 divide-y divide-slate-50 text-xs font-semibold text-slate-600">
                                {f.items.map((i, idx) => (
                                  <div key={idx} className="flex justify-between py-1.5">
                                    <span>{i.nombre} ({i.codigo})</span>
                                    <span>{Number(i.cantidad).toFixed(2)} x ${Number(i.precio_unitario).toFixed(2)} = ${Number(i.total_linea).toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 4. Historial de Pago */}
              {activeTab === "pago" && (
                <div className="space-y-6">
                  {historialPago?.requiere_cuestionario_cobranza && (
                    <div className="border-2 border-amber-300 bg-amber-50 rounded-2xl p-4 space-y-3">
                      <p className="text-xs font-black uppercase text-amber-800">⚠️ Cliente con saldo vencido — Gestión de Cobranza</p>
                      <textarea
                        rows={2}
                        className="w-full rounded-xl border border-amber-200 px-3 py-2 text-sm bg-white"
                        placeholder="¿Qué respondió el cliente sobre su deuda?"
                        value={respuestaCobranza}
                        onChange={(e) => setRespuestaCobranza(e.target.value)}
                      />
                      <label className="flex items-center gap-2 text-xs font-semibold text-amber-800">
                        <input type="checkbox" checked={gestionEfectiva} onChange={(e) => setGestionEfectiva(e.target.checked)} />
                        Gestión efectiva
                      </label>
                      <button
                        onClick={enviarGestionCobranza}
                        disabled={!respuestaCobranza.trim() || loadingAccion}
                        className="w-full bg-amber-700 hover:bg-amber-800 text-white font-bold py-2 rounded-xl text-xs"
                      >
                        {loadingAccion ? "Guardando..." : "Registrar Gestión de Cobranza"}
                      </button>
                    </div>
                  )}

                  <div>
                    <h4 className="text-sm font-bold uppercase tracking-wider text-emerald-950 mb-3">Saldo Pendiente</h4>
                    {!historialPago || historialPago.pendientes.length === 0 ? (
                      <p className="text-xs text-emerald-700 font-semibold py-3">✓ Sin saldo pendiente.</p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-slate-400 uppercase text-[10px] font-bold border-b border-slate-100">
                            <th className="py-2">Documento</th><th>Vencimiento</th><th>Saldo</th><th>Estado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {historialPago.pendientes.map((p) => (
                            <tr key={p.id} className="font-semibold text-slate-700">
                              <td className="py-2">{p.numero_doc}</td>
                              <td>{new Date(p.fecha_vencimiento).toLocaleDateString()}</td>
                              <td className="font-mono">${Number(p.saldo_usd).toFixed(2)}</td>
                              <td>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${p.vencida ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
                                  {p.vencida ? "Vencida" : "Vigente"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  <div className="border-t border-slate-100 pt-6">
                    <h4 className="text-sm font-bold uppercase tracking-wider text-emerald-950 mb-3">Pagos Recientes</h4>
                    {!historialPago || historialPago.pagos_recientes.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">Sin pagos registrados.</p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-slate-400 uppercase text-[10px] font-bold border-b border-slate-100">
                            <th className="py-2">Fecha</th><th>Monto</th><th>Método</th><th>Estado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {historialPago.pagos_recientes.map((p, idx) => (
                            <tr key={idx} className="font-semibold text-slate-700">
                              <td className="py-2">{new Date(p.fecha).toLocaleDateString()}</td>
                              <td className="font-mono">${Number(p.monto).toFixed(2)}</td>
                              <td>{p.metodo}</td>
                              <td>{p.estado}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}

              {/* 5. Toma de Presupuesto */}
              {activeTab === "presupuesto" && (
                <div className="space-y-6">
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Buscar Producto</label>
                      <input
                        type="text"
                        className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm bg-slate-50"
                        placeholder="Código o nombre del producto..."
                        value={prodBusquedaCesta}
                        onChange={(e) => setProdBusquedaCesta(e.target.value)}
                      />
                    </div>
                    <div className="w-48">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400" htmlFor="tipo-orden-select">Tipo de Documento</label>
                      <select
                        id="tipo-orden-select"
                        className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white"
                        value={tipoOrden}
                        onChange={(e) => setTipoOrden(e.target.value as "presupuesto" | "pedido")}
                      >
                        <option value="presupuesto">Presupuesto (Cotización)</option>
                        <option value="pedido">Pedido (Backorder / Venta)</option>
                      </select>
                    </div>
                  </div>

                  {prodBusquedaCesta && (
                    <div className="border border-slate-100 rounded-2xl max-h-40 overflow-y-auto divide-y divide-slate-50 p-2 shadow-inner">
                      {productosFiltradosCesta.map((p) => (
                        <div key={p.id} className="flex justify-between items-center py-2 px-3 text-xs font-semibold text-slate-700">
                          <span>{p.nombre} ({p.codigo_interno}) - <span className="text-emerald-700">${Number(p.precio_1_detalle).toFixed(2)}</span></span>
                          <button onClick={() => agregarACesta(p)} className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-3 py-1 rounded-lg font-bold">+ Añadir</button>
                        </div>
                      ))}
                    </div>
                  )}

                  {cesta.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-6 text-center">La cesta está vacía. Busca y añade productos arriba.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {cesta.map((item) => (
                        <div key={item.producto.id} className="flex justify-between items-center border border-slate-100 rounded-xl p-3 bg-slate-50/30 text-xs font-semibold text-slate-800">
                          <div className="flex-1">
                            <p className="font-extrabold text-slate-900">{item.producto.nombre}</p>
                            <p className="text-slate-400 text-[10px] mt-0.5">Precio: ${Number(item.producto.precio_1_detalle).toFixed(2)}</p>
                          </div>
                          <div className="flex items-center gap-4">
                            <input
                              type="number"
                              aria-label="Cantidad"
                              className="w-16 text-center text-xs font-bold border border-slate-200 rounded-lg py-1"
                              value={item.cantidad}
                              onChange={(e) => cambiarCantidadCesta(item.producto.id, Number(e.target.value))}
                            />
                            <span className="w-20 text-right font-black text-slate-900">${(item.cantidad * item.precio_unitario).toFixed(2)}</span>
                            <button onClick={() => removerDeCesta(item.producto.id)} className="text-red-500 hover:text-red-700 text-sm font-bold">✕</button>
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-between items-center pt-4 border-t border-slate-100 font-black text-slate-900">
                        <span className="text-sm">Total Estimado:</span>
                        <span className="text-xl text-emerald-800">${totalCesta.toFixed(2)}</span>
                      </div>
                      <textarea
                        rows={2}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-slate-50"
                        placeholder="Observaciones de entrega, crédito solicitado..."
                        value={notasOrden}
                        onChange={(e) => setNotasOrden(e.target.value)}
                      />
                      <button
                        onClick={enviarOrden}
                        disabled={cesta.length === 0 || loadingAccion}
                        className="w-full bg-emerald-800 hover:bg-emerald-950 text-white font-bold py-2.5 rounded-xl text-xs"
                      >
                        {loadingAccion ? "Enviando..." : `Confirmar y Registrar ${tipoOrden === "pedido" ? "Pedido" : "Presupuesto"}`}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* 6. Datos del Cliente */}
              {activeTab === "datos" && (
                <div className="space-y-4">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-emerald-950 mb-3">Editar Información del Cliente</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Nombre / Razón Social</span>
                      <input type="text" className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm bg-slate-50" value={nombreCli} onChange={(e) => setNombreCli(e.target.value)} />
                    </label>
                    <label className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cédula / RIF</span>
                      <input type="text" className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm bg-slate-50" value={cedulaCli} onChange={(e) => setCedulaCli(e.target.value)} />
                    </label>
                    <label className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Teléfono</span>
                      <input type="text" className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm bg-slate-50" value={telefonoCli} onChange={(e) => setTelefonoCli(e.target.value)} />
                    </label>
                    <label className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Email</span>
                      <input type="email" className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm bg-slate-50" value={emailCli} onChange={(e) => setEmailCli(e.target.value)} />
                    </label>
                    <label className="col-span-1 md:col-span-2 flex flex-col">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Dirección</span>
                      <textarea rows={2} className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm bg-slate-50" value={direccionCli} onChange={(e) => setDireccionCli(e.target.value)} />
                    </label>
                  </div>
                  <button
                    onClick={guardarCambiosCliente}
                    disabled={loadingAccion}
                    className="w-full mt-2 bg-emerald-800 hover:bg-emerald-950 text-white font-bold py-2.5 rounded-xl text-xs"
                  >
                    {loadingAccion ? "Guardando..." : "Guardar Cambios"}
                  </button>
                </div>
              )}

            </div>
          )}
        </div>
      )}
    </div>
  );
}
