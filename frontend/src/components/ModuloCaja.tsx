import { useRef, useState, useEffect, useCallback, type KeyboardEvent } from "react";
import apiClient from "../api/client";
import DeliveryOrderForm from "./DeliveryOrderForm";
import ModalSolicitudDesposte from "./ModalSolicitudDesposte";
import { normalizeDept } from "../lib/departamentos";

interface ClienteLite {
  id: number;
  nombre: string;
  cedula: string;
}

interface ProductoResponse {
  id: number;
  codigo_interno: string;
  codigo_barras: string | null;
  nombre: string;
  precio_1_detalle: number;
  linea: string | null;
  stock_total: number;
}

interface ItemCarrito {
  id: string;
  nombre: string;
  precio: number;
  cantidad: number;
  unidad: "u" | "kg";
}

interface TicketPendiente {
  id: number;
  empresa_id: number;
  usuario_id: number;
  producto_id: number;
  cliente_id: number;
  peso: number;
  monto_usd: number;
  monto_ves: number;
  status: string;
  created_at: string;
}

const DEFAULT_TASA_BCV = 602.33;
const METODOS_PAGO = ["Efectivo $", "Efectivo Bs", "Punto de Venta", "Pago Móvil"];

const fmtKg = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fmt = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inputClsSmall = "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

const ESTADO_LABEL_DESPOSTE: Record<string, { label: string; cls: string }> = {
  verificado: { label: "Verificado", cls: "bg-emerald-100 text-emerald-700" },
  cancelado: { label: "Cancelado", cls: "bg-slate-200 text-slate-600" },
};

// Seguimiento del flujo Caja -> Balanza -> Caja: se muestra igual en ambas pantallas de
// ModuloCaja (con y sin cliente seleccionado) para que una solicitud nunca "desaparezca"
// de la vista del cajero mientras está pendiente o recién ejecutada.
function SeguimientoDesposteCaja({
  pendientes, completadas, mostrarVerificar, setMostrarVerificar, verificandoId, onVerificar,
  mostrarHistorial, onToggleHistorial, historial,
  mostrarSolicitar, setMostrarSolicitar, onCreadoSolicitud,
}: {
  pendientes: any[]; completadas: any[]; mostrarVerificar: boolean; setMostrarVerificar: (fn: (v: boolean) => boolean) => void;
  verificandoId: number | null; onVerificar: (id: number) => void;
  mostrarHistorial: boolean; onToggleHistorial: () => void; historial: any[];
  mostrarSolicitar: boolean; setMostrarSolicitar: (v: boolean) => void; onCreadoSolicitud: () => void;
}) {
  return (
    <>
      {/* Solicitudes de desposte ya enviadas a Balanza, esperando a que las ejecuten */}
      {pendientes.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-3xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">⏳</span>
            <h4 className="font-black tracking-tight text-sm text-amber-900">DESPOSTE PENDIENTE EN BALANZA ({pendientes.length})</h4>
          </div>
          {pendientes.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 bg-white rounded-2xl border border-amber-100 px-4 py-2.5">
              <div>
                <p className="text-xs font-bold text-slate-800">
                  {s.producto_origen_nombre} — {Number(s.cantidad_estimada).toFixed(3)} kg estimados · {s.departamento}
                </p>
                <p className="text-[10px] text-slate-400">
                  Solicitado por {s.solicitado_por_nombre ?? "—"} el {new Date(s.created_at).toLocaleString("es-VE")}
                  {s.comentario_solicitud ? ` — "${s.comentario_solicitud}"` : ""}
                </p>
              </div>
              <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-2.5 py-1 rounded-full uppercase whitespace-nowrap">Esperando a Balanza</span>
            </div>
          ))}
        </div>
      )}

      {/* Desposte(s) ejecutado(s) por Balanza, pendientes de verificación */}
      {completadas.length > 0 && (
        <div
          onClick={() => setMostrarVerificar((v) => !v)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white p-4 rounded-3xl flex items-center justify-between shadow-lg cursor-pointer transition-all border border-emerald-500"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <h4 className="font-black tracking-tight text-sm md:text-base">DESPOSTE COMPLETADO</h4>
              <p className="text-xs text-emerald-100 font-medium">Balanza ya pesó y registró el resultado. Verifica y envía a historial.</p>
            </div>
          </div>
          <span className="bg-white/20 text-white font-bold text-xs px-3 py-1.5 rounded-full border border-white/10 uppercase tracking-wider">
            Revisar ({completadas.length})
          </span>
        </div>
      )}

      {mostrarVerificar && completadas.length > 0 && (
        <div className="bg-emerald-50/50 border border-emerald-100 rounded-3xl p-4 space-y-2 animate-fade-in">
          {completadas.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 bg-white rounded-2xl border border-emerald-100 px-4 py-3">
              <div>
                <p className="text-xs font-bold text-slate-800">
                  {s.producto_origen_nombre} — Peso real: {s.desposte ? Number(s.desposte.peso_origen).toFixed(3) : "?"} kg, Merma: {s.desposte ? Number(s.desposte.merma_peso).toFixed(3) : "?"} kg
                </p>
                <p className="text-[10px] text-slate-400">Ejecutado por {s.ejecutado_por_nombre ?? "Balanza"} el {new Date(s.ejecutado_en).toLocaleString("es-VE")}</p>
              </div>
              <button
                type="button"
                disabled={verificandoId === s.id}
                onClick={() => onVerificar(s.id)}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-all whitespace-nowrap"
              >
                {verificandoId === s.id ? "Verificando..." : "Verificar y enviar a historial"}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onToggleHistorial}
          className="text-xs font-bold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-full transition-all"
        >
          🧾 {mostrarHistorial ? "Ocultar historial de desposte" : "Historial de desposte"}
        </button>
      </div>

      {mostrarHistorial && (
        <div className="rounded-3xl border border-slate-100 bg-white shadow-sm overflow-hidden animate-fade-in">
          <div className="p-3 bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase text-slate-500">Historial de Desposte (verificados y cancelados)</div>
          <div className="divide-y divide-slate-50 max-h-72 overflow-y-auto">
            {historial.length === 0 && <p className="text-xs text-slate-400 text-center py-6">Sin movimientos de desposte en el historial todavía.</p>}
            {historial.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-2.5 text-xs">
                <div>
                  <span className="font-bold text-slate-800">{s.producto_origen_nombre}</span>
                  <span className="text-slate-400"> · {s.departamento} · {new Date(s.created_at).toLocaleDateString("es-VE")}</span>
                  {s.estatus === "verificado" && s.desposte && (
                    <p className="text-[10px] text-slate-400">
                      Peso real {Number(s.desposte.peso_origen).toFixed(3)} kg, merma {Number(s.desposte.merma_peso).toFixed(3)} kg · verificado por {s.verificado_por_nombre ?? "Caja"}
                    </p>
                  )}
                  {s.estatus === "cancelado" && s.cancelado_motivo && <p className="text-[10px] text-slate-400">Motivo: {s.cancelado_motivo}</p>}
                </div>
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${ESTADO_LABEL_DESPOSTE[s.estatus]?.cls ?? "bg-slate-100 text-slate-500"}`}>
                  {ESTADO_LABEL_DESPOSTE[s.estatus]?.label ?? s.estatus}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {mostrarSolicitar && (
        <ModalSolicitudDesposte
          onClose={() => setMostrarSolicitar(false)}
          onCreado={() => { setMostrarSolicitar(false); onCreadoSolicitud(); }}
        />
      )}
    </>
  );
}

export default function ModuloCaja() {
  const [scan, setScan] = useState("");
  const [mostrarDropdown, setMostrarDropdown] = useState(false);
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [metodoPago, setMetodoPago] = useState(METODOS_PAGO[0]);
  const [error, setError] = useState("");
  const [tabPesado, setTabPesado] = useState<"carniceria" | "verduleria" | "charcuteria">("carniceria");
  const [pesoModal, setPesoModal] = useState<ProductoResponse | null>(null);
  const [pesoInput, setPesoInput] = useState("");
  const scanRef = useRef<HTMLInputElement>(null);

  // --- Tasa, Database and pending tickets ---
  const [tasaBcv, setTasaBcv] = useState(DEFAULT_TASA_BCV);
  const [dbProductos, setDbProductos] = useState<ProductoResponse[]>([]);
  const [ticketsPendientes, setTicketsPendientes] = useState<TicketPendiente[]>([]);
  const [ticketsSeleccionados, setTicketsSeleccionados] = useState<number[]>([]);
  const [ticketModificaciones, setTicketModificaciones] = useState<Record<number, number>>({});

  // --- Cliente ---
  const [cliente, setCliente] = useState<ClienteLite | null>(null);
  const [cedulaInput, setCedulaInput] = useState("V-");
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [mostrarRegistro, setMostrarRegistro] = useState(false);
  const [cedulaError, setCedulaError] = useState("");
  const [verificando, setVerificando] = useState(false);

  // --- Cliente Historial ---
  const [historialCompras, setHistorialCompras] = useState<any[]>([]);
  const [limiteHistorial, setLimiteHistorial] = useState(5);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [mostrarHistorialCaja, setMostrarHistorialCaja] = useState(false);

  // --- Cliente Encuestas / Alertas de Calidad ---
  const [encuestasPendientes, setEncuestasPendientes] = useState<any[]>([]);
  const [mostrarResolucionModal, setMostrarResolucionModal] = useState(false);
  const [resolucionComentario, setResolucionComentario] = useState("");
  const [guardandoResolucion, setGuardandoResolucion] = useState(false);
  const [resolucionError, setResolucionError] = useState("");

  // --- Payment Fields ---
  const [tipoTarjeta, setTipoTarjeta] = useState<"TDD" | "TDC">("TDD");
  const [numComprobante, setNumComprobante] = useState("");
  const [referenciaPagoMovil, setReferenciaPagoMovil] = useState("");
  const [capturePagoMovilName, setCapturePagoMovilName] = useState("");
  const [montoRecibido, setMontoRecibido] = useState("");

  // --- Checkout Processing ---
  const [procesandoPago, setProcesandoPago] = useState(false);
  const [pagoCompletadoData, setPagoCompletadoData] = useState<any | null>(null);
  const [mostrarEnvioDelivery, setMostrarEnvioDelivery] = useState(false);

  // --- Desposte: solicitar (Caja), seguir lo pendiente, verificar lo ya ejecutado por Balanza, e historial ---
  const [mostrarSolicitarDesposte, setMostrarSolicitarDesposte] = useState(false);
  const [solicitudesPendientesDesposte, setSolicitudesPendientesDesposte] = useState<any[]>([]);
  const [solicitudesCompletadas, setSolicitudesCompletadas] = useState<any[]>([]);
  const [mostrarVerificarDesposte, setMostrarVerificarDesposte] = useState(false);
  const [verificandoId, setVerificandoId] = useState<number | null>(null);
  const [mostrarHistorialDesposte, setMostrarHistorialDesposte] = useState(false);
  const [historialDesposte, setHistorialDesposte] = useState<any[]>([]);

  const cargarSolicitudesPendientesDesposte = useCallback(() => {
    apiClient.get("/api/v1/desposte-solicitudes", { params: { estatus: "pendiente" } })
      .then((res) => setSolicitudesPendientesDesposte(res.data))
      .catch(() => setSolicitudesPendientesDesposte([]));
  }, []);

  const cargarSolicitudesCompletadas = useCallback(() => {
    apiClient.get("/api/v1/desposte-solicitudes", { params: { estatus: "completado" } })
      .then((res) => setSolicitudesCompletadas(res.data))
      .catch(() => setSolicitudesCompletadas([]));
  }, []);

  useEffect(() => {
    cargarSolicitudesPendientesDesposte();
    cargarSolicitudesCompletadas();
    const t = setInterval(() => {
      cargarSolicitudesPendientesDesposte();
      cargarSolicitudesCompletadas();
    }, 15000);
    return () => clearInterval(t);
  }, [cargarSolicitudesPendientesDesposte, cargarSolicitudesCompletadas]);

  function cargarHistorialDesposte() {
    Promise.all([
      apiClient.get("/api/v1/desposte-solicitudes", { params: { estatus: "verificado" } }),
      apiClient.get("/api/v1/desposte-solicitudes", { params: { estatus: "cancelado" } }),
    ])
      .then(([verificadas, canceladas]) => {
        const todas = [...verificadas.data, ...canceladas.data].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setHistorialDesposte(todas);
      })
      .catch(() => setHistorialDesposte([]));
  }

  async function verificarDesposte(id: number) {
    setVerificandoId(id);
    try {
      await apiClient.patch(`/api/v1/desposte-solicitudes/${id}/verificar`, {});
      cargarSolicitudesCompletadas();
      if (mostrarHistorialDesposte) cargarHistorialDesposte();
    } catch {
      // silencioso: la lista se vuelve a refrescar en el próximo polling
    } finally {
      setVerificandoId(null);
    }
  }

  // --- Cola de clientes en espera ---
  const [colaClientes, setColaClientes] = useState<any[]>([]);
  const [cargandoCola, setCargandoCola] = useState(false);

  async function cargarColaClientes() {
    setCargandoCola(true);
    try {
      const ticketsRes = await apiClient.get<TicketPendiente[]>("/api/v1/tickets", {
        params: { status: "pendiente" }
      });
      const pendingTickets = ticketsRes.data;

      if (pendingTickets.length === 0) {
        setColaClientes([]);
        return;
      }


      // Fetch all clients of the company for lookup (using a generous limit of 5000)
      const clientesRes = await apiClient.get<ClienteLite[]>("/api/v1/clientes", {
        params: { limit: 5000 }
      });
      const allClients = clientesRes.data;
      const clientMap = new Map<number, ClienteLite>();
      allClients.forEach(c => clientMap.set(c.id, c));

      // Group tickets by client
      const grouped: Record<number, { cliente_id: number; nombre: string; cedula: string; ticketCount: number; totalUsd: number }> = {};

      pendingTickets.forEach(t => {
        const cId = t.cliente_id;
        if (!grouped[cId]) {
          const clientInfo = clientMap.get(cId);
          grouped[cId] = {
            cliente_id: cId,
            nombre: clientInfo ? clientInfo.nombre : `Cliente #${cId}`,
            cedula: clientInfo ? clientInfo.cedula : "N/A",
            ticketCount: 0,
            totalUsd: 0
          };
        }
        grouped[cId].ticketCount += 1;
        grouped[cId].totalUsd += Number(t.monto_usd);
      });

      setColaClientes(Object.values(grouped));
    } catch (err) {
      console.error("Error al cargar cola de clientes:", err);
    } finally {
      setCargandoCola(false);
    }
  }

  async function seleccionarClienteDeCola(c: { cliente_id: number; nombre: string; cedula: string }) {
    const cLite: ClienteLite = {
      id: c.cliente_id,
      nombre: c.nombre,
      cedula: c.cedula
    };
    setCliente(cLite);
    setMostrarRegistro(false);
    setCedulaInput(c.cedula);
    cargarTicketsPendientes(c.cliente_id);
    cargarHistorialCompras(c.cliente_id);
    cargarEncuestasPendientes(c.cliente_id);
  }

  // Load rate, database products and client queue on mount
  useEffect(() => {
    apiClient.get("/api/v1/tasa")
      .then((res) => {
        if (res.data && res.data.valor_bcv) {
          setTasaBcv(Number(res.data.valor_bcv));
        }
      })
      .catch(() => {});

    apiClient.get<ProductoResponse[]>("/api/v1/productos")
      .then((res) => {
        setDbProductos(res.data);
      })
      .catch((err) => console.error("Error al cargar catálogo:", err));

    cargarColaClientes();
    const interval = setInterval(cargarColaClientes, 10000); // refresh client queue every 10 seconds
    return () => clearInterval(interval);
  }, []);

  async function verificarCedula() {
    const cedula = cedulaInput.trim().toUpperCase();
    if (!cedula || cedula === "V-") return;
    setCedulaError("");
    setVerificando(true);
    try {
      const { data } = await apiClient.get<ClienteLite[]>("/api/v1/clientes", { params: { cedula } });
      if (data.length > 0) {
        setCliente(data[0]);
        setMostrarRegistro(false);
        // Load pending weighing tickets for this client
        cargarTicketsPendientes(data[0].id);
        // Load client purchase history
        cargarHistorialCompras(data[0].id);
        // Load client pending quality alerts
        cargarEncuestasPendientes(data[0].id);
      } else {
        setMostrarRegistro(true);
      }
    } catch {
      setCedulaError("No se pudo verificar la cédula. Intenta de nuevo.");
    } finally {
      setVerificando(false);
    }
  }

  async function registrarClienteExpress() {
    const cedula = cedulaInput.trim().toUpperCase();
    const nombre = nombreNuevo.trim();
    if (!nombre) {
      setCedulaError("El Nombre Completo es obligatorio.");
      return;
    }
    setCedulaError("");
    setVerificando(true);
    try {
      const { data } = await apiClient.post<ClienteLite>("/api/v1/clientes", { cedula, nombre });
      setCliente(data);
      setMostrarRegistro(false);
      setNombreNuevo("");
      setTicketsPendientes([]);
      setTicketsSeleccionados([]);
      setHistorialCompras([]);
      setEncuestasPendientes([]);
    } catch {
      setCedulaError("No se pudo registrar el cliente.");
    } finally {
      setVerificando(false);
    }
  }

  async function cargarTicketsPendientes(clienteId: number) {
    try {
      const { data } = await apiClient.get<TicketPendiente[]>("/api/v1/tickets", {
        params: { status: "pendiente", cliente_id: clienteId }
      });
      setTicketsPendientes(data);
      setTicketsSeleccionados(data.map(t => t.id));
    } catch (err) {
      console.error("Error al cargar tickets pendientes:", err);
    }
  }

  const actualizarPesoTicket = (ticketId: number, nuevoPeso: number) => {
    if (isNaN(nuevoPeso) || nuevoPeso < 0) return;
    setTicketsPendientes(prev =>
      prev.map(t => {
        if (t.id === ticketId) {
          const prod = dbProductos.find(p => p.id === t.producto_id);
          const precio = prod ? Number(prod.precio_1_detalle) : 0;
          const nuevoMontoUsd = nuevoPeso * precio;
          return {
            ...t,
            peso: nuevoPeso,
            monto_usd: nuevoMontoUsd,
            monto_ves: nuevoMontoUsd * tasaBcv
          };
        }
        return t;
      })
    );
    setTicketModificaciones(prev => ({
      ...prev,
      [ticketId]: nuevoPeso
    }));
  };

  const eliminarTicket = async (ticketId: number) => {
    try {
      await apiClient.put(`/api/v1/tickets/${ticketId}/cancelar`);
      setTicketsPendientes(prev => prev.filter(t => t.id !== ticketId));
      setTicketsSeleccionados(prev => prev.filter(id => id !== ticketId));
      setTicketModificaciones(prev => {
        const copy = { ...prev };
        delete copy[ticketId];
        return copy;
      });
    } catch (err: any) {
      console.error("Error al cancelar ticket:", err);
      setError(err.response?.data?.detail ?? "Error al cancelar el ticket de balanza.");
    }
  };

  // Load client purchase history
  async function cargarHistorialCompras(clienteId: number) {
    setCargandoHistorial(true);
    setLimiteHistorial(5);
    try {
      const { data } = await apiClient.get<any[]>("/api/v1/tickets", {
        params: { cliente_id: clienteId, status: "procesado" }
      });
      // Sort by date descending
      const sorted = data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setHistorialCompras(sorted);
    } catch (err) {
      console.error("Error al cargar historial:", err);
    } finally {
      setCargandoHistorial(false);
    }
  }

  // Load pending quality surveys/complaints
  async function cargarEncuestasPendientes(clienteId: number) {
    try {
      const { data } = await apiClient.get<any[]>("/api/v1/crm/postventa-logs", {
        params: { cliente_id: clienteId, status_envio: "pendiente" }
      });
      setEncuestasPendientes(data);
    } catch (err) {
      console.error("Error al cargar encuestas pendientes:", err);
    }
  }

  // Resolve quality survey
  async function resolverEncuesta(logId: number) {
    if (!cliente) return;
    setGuardandoResolucion(true);
    setResolucionError("");

    const respuesta_adicional = resolucionComentario.trim()
      ? ` [Resuelto en Caja: ${resolucionComentario.trim()}]`
      : " [Resuelto en Caja]";

    // Get current comment of the log to append the resolution
    const logObj = encuestasPendientes.find(e => e.id === logId);
    const originalComment = logObj?.respuesta_cliente ?? "";
    const nuevoComentario = originalComment + respuesta_adicional;

    try {
      await apiClient.put(`/api/v1/crm/postventa-logs/${logId}`, {
        status_envio: "resuelto",
        respuesta_cliente: nuevoComentario
      });
      // Refresh pending surveys
      cargarEncuestasPendientes(cliente.id);
      setResolucionComentario("");
    } catch (err: any) {
      console.error(err);
      setResolucionError(err.response?.data?.detail ?? "Error al resolver la queja.");
    } finally {
      setGuardandoResolucion(false);
    }
  }

  function cerrarTicket() {
    setCarrito([]);
    setCliente(null);
    setCedulaInput("V-");
    setNombreNuevo("");
    setMostrarRegistro(false);
    setCedulaError("");
    setMetodoPago(METODOS_PAGO[0]);
    setError("");
    setTipoTarjeta("TDD");
    setNumComprobante("");
    setReferenciaPagoMovil("");
    setCapturePagoMovilName("");
    setMontoRecibido("");
    setTicketsPendientes([]);
    setTicketsSeleccionados([]);
    setTicketModificaciones({});
    setHistorialCompras([]);
    setMostrarHistorialCaja(false);
    setEncuestasPendientes([]);
    setMostrarResolucionModal(false);
    setResolucionComentario("");
    cargarColaClientes();
  }

  // Final check-out execution
  async function procesarCobroFinal() {
    if (!cliente) return;
    setProcesandoPago(true);
    setError("");

    try {
      // 1. Process shelf items (if any in cart)
      if (carrito.length > 0) {
        const items = carrito.map(item => ({
          producto_id: Number(item.id),
          peso: item.cantidad
        }));
        await apiClient.post("/api/v1/tickets", {
          cliente_id: cliente.id,
          items: items
        });
      }

      // 2. Process pending tickets from weighing stations (if any selected)
      if (ticketsSeleccionados.length > 0) {
        const mods = Object.entries(ticketModificaciones)
          .filter(([id]) => ticketsSeleccionados.includes(Number(id)))
          .map(([id, peso]) => ({
            ticket_id: Number(id),
            peso: Number(peso)
          }));
        await apiClient.post("/api/v1/tickets/procesar-pago", {
          ticket_ids: ticketsSeleccionados,
          modificaciones: mods.length > 0 ? mods : undefined
        });
      }

      // Calculate totals for receipt
      const totalCarritoUsd = carrito.reduce((acc, i) => acc + i.precio * i.cantidad, 0);
      
      const ticketsSeleccionadosDetalles = ticketsPendientes.filter(t => ticketsSeleccionados.includes(t.id));
      const totalBalanzaUsd = ticketsSeleccionadosDetalles.reduce((acc, t) => acc + Number(t.monto_usd), 0);
      
      const totalFinalUsd = totalCarritoUsd + totalBalanzaUsd;
      const totalFinalVes = totalFinalUsd * tasaBcv;

      // Group balanza tickets by department for receipt breakdown
      const porDepartamento: Record<string, number> = {
        "Carnicería": 0,
        "Verdulería": 0,
        "Charcutería": 0,
      };

      ticketsSeleccionadosDetalles.forEach(t => {
        const prod = dbProductos.find(p => p.id === t.producto_id);
        const dept = prod?.linea ?? "General";
        const deptName = dept.includes("Carnic") ? "Carnicería" 
                       : dept.includes("Verdul") ? "Verdulería"
                       : dept.includes("Charcut") ? "Charcutería" : "General";
        
        porDepartamento[deptName] = (porDepartamento[deptName] || 0) + Number(t.monto_usd);
      });

      // Set the receipt state
      setPagoCompletadoData({
        clienteName: cliente.nombre,
        clienteCedula: cliente.cedula,
        totalCarritoUsd,
        totalBalanzaUsd,
        porDepartamento,
        totalUsd: totalFinalUsd,
        totalVes: totalFinalVes,
        metodoPago,
        montoRecibido: Number(montoRecibido) || 0,
        vuelto: Math.max(0, (Number(montoRecibido) || 0) - (metodoPago === "Efectivo Bs" ? totalFinalVes : totalFinalUsd)),
        fecha: new Date().toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" }),
        facturaNum: Math.floor(Math.random() * 900000) + 100000
      });

    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail ?? "Error al procesar el cobro e inventario.");
    } finally {
      setProcesandoPago(false);
    }
  }

  function agregarProducto(producto: ProductoResponse) {
    setCarrito((prev) => {
      const existe = prev.find((i) => i.id === String(producto.id));
      if (existe) {
        return prev.map((i) => (i.id === String(producto.id) ? { ...i, cantidad: i.cantidad + 1 } : i));
      }
      return [
        ...prev,
        {
          id: String(producto.id),
          nombre: producto.nombre,
          precio: Number(producto.precio_1_detalle),
          cantidad: 1,
          unidad: producto.linea && ["carniceria", "verduleria", "charcuteria"].includes(normalizeDept(producto.linea)) ? "kg" : "u"
        }
      ];
    });
  }

  function ajustarCantidad(id: string, delta: number) {
    setCarrito((prev) =>
      prev
        .map((i) => (i.id === id ? { ...i, cantidad: i.cantidad + delta } : i))
        .filter((i) => i.cantidad > 0)
    );
  }

  function confirmarPeso() {
    if (!pesoModal) return;
    const peso = Number(pesoInput);
    if (!peso || peso <= 0) return;

    setCarrito((prev) => {
      const existe = prev.find((i) => i.id === String(pesoModal.id));
      if (existe) {
        return prev.map((i) => (i.id === String(pesoModal.id) ? { ...i, cantidad: i.cantidad + peso } : i));
      }
      return [
        ...prev,
        {
          id: String(pesoModal.id),
          nombre: pesoModal.nombre,
          precio: Number(pesoModal.precio_1_detalle),
          cantidad: peso,
          unidad: "kg"
        }
      ];
    });
    setPesoModal(null);
    setPesoInput("");
  }

  function seleccionarProducto(producto: ProductoResponse) {
    agregarProducto(producto);
    setScan("");
    setMostrarDropdown(false);
    setError("");
    scanRef.current?.focus();
  }

  function handleScan(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const codigo = scan.trim().toLowerCase();
    if (!codigo) return;

    const producto = dbProductos.find(
      (p) =>
        p.codigo_interno?.toLowerCase() === codigo ||
        p.codigo_barras?.toLowerCase() === codigo
    );

    if (producto) {
      seleccionarProducto(producto);
    } else {
      setError(`Código no reconocido: ${scan.trim()}`);
      setScan("");
      setMostrarDropdown(false);
      scanRef.current?.focus();
    }
  }

  const busqueda = scan.trim().toLowerCase();
  const coincidencias = busqueda
    ? dbProductos.filter(
        (p) =>
          p.nombre.toLowerCase().includes(busqueda) ||
          p.codigo_interno?.toLowerCase().includes(busqueda) ||
          p.codigo_barras?.toLowerCase().includes(busqueda)
      )
    : [];

  // Cart calculations
  const totalCarritoUsd = carrito.reduce((acc, i) => acc + i.precio * i.cantidad, 0);
  
  // Pending tickets calculations
  const ticketsSeleccionadosDetalles = ticketsPendientes.filter(t => ticketsSeleccionados.includes(t.id));
  const totalBalanzaUsd = ticketsSeleccionadosDetalles.reduce((acc, t) => acc + Number(t.monto_usd), 0);
  
  // Final total
  const totalUsd = totalCarritoUsd + totalBalanzaUsd;
  const totalVes = totalUsd * tasaBcv;

  const totalActivo = metodoPago === "Efectivo Bs" ? totalVes : totalUsd;
  const montoRecibidoNum = Number(montoRecibido) || 0;
  const vuelto = montoRecibidoNum - totalActivo;

  const cobrarDeshabilitado =
    (carrito.length === 0 && ticketsSeleccionados.length === 0) ||
    (metodoPago === "Punto de Venta" && !numComprobante.trim()) ||
    (metodoPago === "Pago Móvil" && (!referenciaPagoMovil.trim() || !capturePagoMovilName)) ||
    procesandoPago;

  // Filter products for the POS backup weigh section
  const productosPesadosFiltrados = dbProductos.filter(
    (p) => normalizeDept(p.linea) === tabPesado
  );

  if (!cliente) {
    return (
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <SeguimientoDesposteCaja
          pendientes={solicitudesPendientesDesposte}
          completadas={solicitudesCompletadas}
          mostrarVerificar={mostrarVerificarDesposte}
          setMostrarVerificar={setMostrarVerificarDesposte}
          verificandoId={verificandoId}
          onVerificar={verificarDesposte}
          mostrarHistorial={mostrarHistorialDesposte}
          onToggleHistorial={() => setMostrarHistorialDesposte((v) => { if (!v) cargarHistorialDesposte(); return !v; })}
          historial={historialDesposte}
          mostrarSolicitar={mostrarSolicitarDesposte}
          setMostrarSolicitar={setMostrarSolicitarDesposte}
          onCreadoSolicitud={cargarSolicitudesPendientesDesposte}
        />

        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-3xl font-black tracking-tight text-slate-900">Caja / POS</h2>
            <p className="text-sm font-medium text-slate-500">Seleccione un cliente en espera o ingrese sus datos de forma manual.</p>
          </div>
          <div className="mt-3 md:mt-0 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMostrarSolicitarDesposte(true)}
              className="flex items-center gap-2 px-4 py-2 bg-violet-50 hover:bg-violet-600 text-violet-700 hover:text-white border border-violet-100 hover:border-violet-600 font-bold text-xs rounded-xl transition-all uppercase tracking-wider"
            >
              🥩 Solicitar Desposte
            </button>
            <button
              type="button"
              onClick={cargarColaClientes}
              disabled={cargandoCola}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-all uppercase tracking-wider"
            >
              <span>🔄</span>
              {cargandoCola ? "Actualizando..." : "Actualizar Cola"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Column 1 & 2: Cola de Clientes en Espera */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <span>⏳</span> Clientes en Espera (Tickets de Balanza)
              </h3>
              <span className="bg-blue-100 text-blue-800 text-xs font-black px-2.5 py-1 rounded-full uppercase tracking-wide">
                {colaClientes.length} en cola
              </span>
            </div>

            {colaClientes.length === 0 ? (
              <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center">
                <span className="text-4xl block mb-3">🛒</span>
                <h4 className="text-base font-bold text-slate-700">No hay clientes con pesajes pendientes</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  Los tickets que se generen en Verdulería, Carnicería o Charcutería aparecerán aquí automáticamente en tiempo real.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {colaClientes.map((c) => (
                  <div
                    key={c.cliente_id}
                    onClick={() => seleccionarClienteDeCola(c)}
                    className="group relative bg-white border border-slate-150 rounded-3xl p-5 hover:border-blue-500 hover:shadow-lg transition-all cursor-pointer flex flex-col justify-between h-40 overflow-hidden"
                  >
                    {/* Background accent badge */}
                    <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-blue-500/5 to-blue-500/0 rounded-bl-full group-hover:from-blue-500/10 transition-all" />

                    <div>
                      <div className="flex items-start justify-between">
                        <span className="text-xs font-mono font-bold text-slate-400 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-md">
                          {c.cedula}
                        </span>
                        <span className="bg-blue-50 border border-blue-100 text-blue-600 text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-wider">
                          🎫 {c.ticketCount} {c.ticketCount === 1 ? "ticket" : "tickets"}
                        </span>
                      </div>
                      <h4 className="mt-3 font-bold text-slate-800 text-lg group-hover:text-blue-600 transition-colors line-clamp-1">
                        {c.nombre}
                      </h4>
                    </div>

                    <div className="flex justify-between items-center border-t border-slate-100 pt-3">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Acumulado</span>
                        <span className="text-lg font-black text-emerald-600 font-mono">${c.totalUsd.toFixed(2)}</span>
                      </div>
                      <span className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-all">
                        Atender ➜
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Column 3: Buscador Manual / Registro */}
          <div className="bg-white rounded-3xl p-6 border border-slate-150 shadow-md space-y-5">
            <div>
              <h3 className="text-lg font-bold text-slate-800">Búsqueda Manual</h3>
              <p className="text-xs text-slate-400 mt-1">Utilice esta opción para clientes que no tienen pesajes previos de balanza.</p>
            </div>

            <label className="flex flex-col">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Cédula del Cliente</span>
              <input
                value={cedulaInput}
                onChange={(e) => setCedulaInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === "Enter") verificarCedula(); }}
                placeholder="V-12345678"
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-base font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white transition-all"
              />
            </label>

            {cedulaError && <p className="text-xs font-semibold text-red-600 bg-red-50 p-2.5 rounded-xl">{cedulaError}</p>}

            {!mostrarRegistro ? (
              <button
                type="button"
                onClick={verificarCedula}
                disabled={verificando || !cedulaInput.trim()}
                className="w-full rounded-2xl bg-slate-900 py-3 text-sm font-bold text-white transition-all duration-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-450 shadow-md"
              >
                {verificando ? "Verificando..." : "Buscar e Iniciar"}
              </button>
            ) : (
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Cliente no encontrado — Registro Express</p>
                
                <label className="flex flex-col">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Nombre Completo</span>
                  <input
                    autoFocus
                    value={nombreNuevo}
                    onChange={(e) => setNombreNuevo(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") registrarClienteExpress(); }}
                    placeholder="Ej: Juan Pérez"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </label>

                <button
                  type="button"
                  onClick={registrarClienteExpress}
                  disabled={verificando}
                  className="w-full rounded-2xl bg-blue-600 py-2.5 text-sm font-bold text-white transition-colors duration-300 hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200"
                >
                  {verificando ? "Registrando..." : "Guardar y Iniciar"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      
      {/* Blinking Quality Alert Banner */}
      {encuestasPendientes.length > 0 && (
        <div 
          onClick={() => setMostrarResolucionModal(true)}
          className="bg-rose-500 hover:bg-rose-650 text-white p-4 rounded-3xl flex items-center justify-between shadow-lg cursor-pointer animate-pulse transition-all border border-rose-400"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <h4 className="font-black tracking-tight text-sm md:text-base">ALERTA DE CALIDAD PENDIENTE</h4>
              <p className="text-xs text-rose-100 font-medium">El cliente reportó problemas con productos anteriores. Haz clic aquí para ver y resolver.</p>
            </div>
          </div>
          <span className="bg-white/20 text-white font-bold text-xs px-3 py-1.5 rounded-full border border-white/10 uppercase tracking-wider">
            Atender ({encuestasPendientes.length})
          </span>
        </div>
      )}

      <SeguimientoDesposteCaja
        pendientes={solicitudesPendientesDesposte}
        completadas={solicitudesCompletadas}
        mostrarVerificar={mostrarVerificarDesposte}
        setMostrarVerificar={setMostrarVerificarDesposte}
        verificandoId={verificandoId}
        onVerificar={verificarDesposte}
        mostrarHistorial={mostrarHistorialDesposte}
        onToggleHistorial={() => setMostrarHistorialDesposte((v) => { if (!v) cargarHistorialDesposte(); return !v; })}
        historial={historialDesposte}
        mostrarSolicitar={mostrarSolicitarDesposte}
        setMostrarSolicitar={setMostrarSolicitarDesposte}
        onCreadoSolicitud={cargarSolicitudesPendientesDesposte}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      {/* --- Main Column (Left/Center) --- */}
      <div className="lg:col-span-2 space-y-6">
        
        {/* SCANNER SEARCH */}
        <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm hover:shadow-md transition-all duration-300">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-black tracking-tight text-slate-900">Caja / POS</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Buscador dinámico: código de barra o interno</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-slate-100 text-slate-700 text-xs font-bold px-3 py-1 rounded-full">
                Catálogo: {dbProductos.length} Productos
              </span>
              <button
                type="button"
                onClick={() => setMostrarSolicitarDesposte(true)}
                className="bg-violet-50 hover:bg-violet-600 text-violet-700 hover:text-white border border-violet-100 hover:border-violet-600 text-xs font-bold px-3 py-1 rounded-full transition-all"
              >
                🥩 Solicitar Desposte
              </button>
            </div>
          </div>

          <div className="relative mt-4">
            <input
              ref={scanRef}
              autoFocus
              value={scan}
              onChange={(e) => {
                setScan(e.target.value);
                setMostrarDropdown(true);
              }}
              onFocus={() => setMostrarDropdown(true)}
              onKeyDown={handleScan}
              placeholder="Escanear código o escribir nombre (ej. Harina PAN, P001)..."
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-lg font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {mostrarDropdown && busqueda && coincidencias.length > 0 && (
              <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-60 overflow-y-auto divide-y divide-slate-50">
                {coincidencias.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      seleccionarProducto(p);
                    }}
                    className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors duration-150 hover:bg-slate-50"
                  >
                    <div>
                      <span className="font-medium text-slate-700">{p.nombre}</span>
                      <span className="text-[10px] text-slate-400 block font-mono">{p.codigo_interno}</span>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">
                      ${fmt(Number(p.precio_1_detalle))}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {error && <p className="mt-2 text-sm font-medium text-red-600">{error}</p>}
        </section>

        {/* SHOPPING CART: SHELF ITEMS */}
        <section className="rounded-2xl border border-slate-100 bg-white shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">🛒 Artículos de Estante</h3>
            <span className="bg-blue-50 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">
              {carrito.length} Items
            </span>
          </div>

          {carrito.length === 0 ? (
            <p className="p-6 text-sm text-slate-400">Sin artículos de estante en el carrito. Escanee o agregue productos abajo.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Producto</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Cantidad</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Precio USD</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">Subtotal USD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {carrito.map((i) => (
                  <tr key={i.id} className="hover:bg-slate-50/20">
                    <td className="px-4 py-3 font-medium text-slate-700">{i.nombre}</td>
                    <td className="px-4 py-3">
                      {i.unidad === "kg" ? (
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-slate-700">{fmtKg(i.cantidad)} Kg</span>
                          <button
                            type="button"
                            onClick={() => ajustarCantidad(i.id, -i.cantidad)}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors duration-200 hover:bg-slate-200"
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => ajustarCantidad(i.id, -1)}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors duration-200 hover:bg-slate-200"
                          >
                            −
                          </button>
                          <span className="w-6 text-center font-mono">{i.cantidad}</span>
                          <button
                            type="button"
                            onClick={() => ajustarCantidad(i.id, 1)}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors duration-200 hover:bg-slate-200"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">${fmt(i.precio)}{i.unidad === "kg" ? " / Kg" : ""}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">${fmt(i.precio * i.cantidad)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* PENDING WEIGHING TICKETS FROM STATIONS */}
        {cliente && ticketsPendientes.length > 0 && (
          <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm hover:shadow-md transition-all duration-300 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-50 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-1.5">
                  ⚖️ Pedidos de Balanza Pendientes
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Tickets de Carnicería, Verdulería y Charcutería emitidos para este cliente</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (ticketsSeleccionados.length === ticketsPendientes.length) {
                    setTicketsSeleccionados([]);
                  } else {
                    setTicketsSeleccionados(ticketsPendientes.map(t => t.id));
                  }
                }}
                className="text-xs text-blue-600 hover:text-blue-700 font-bold bg-blue-50 px-3 py-1.5 rounded-xl transition-all"
              >
                {ticketsSeleccionados.length === ticketsPendientes.length ? "Deseleccionar Todos" : "Seleccionar Todos"}
              </button>
            </div>

            <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto pr-1">
              {ticketsPendientes.map((ticket) => {
                const prod = dbProductos.find((p) => p.id === ticket.producto_id);
                const descProd = prod ? prod.nombre : `Producto ID ${ticket.producto_id}`;
                const linea = prod?.linea ?? "General";
                const seleccionado = ticketsSeleccionados.includes(ticket.id);

                // Department styling
                const isCarniceria = linea.includes("Carnic");
                const isVerduleria = linea.includes("Verdul");
                const isCharcuteria = linea.includes("Charcut");
                const badgeStyle = isCarniceria
                  ? "bg-rose-50 text-rose-700 border-rose-100"
                  : isVerduleria
                  ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                  : isCharcuteria
                  ? "bg-amber-50 text-amber-700 border-amber-100"
                  : "bg-slate-50 text-slate-700 border-slate-100";

                return (
                  <div
                    key={ticket.id}
                    onClick={() => {
                      if (seleccionado) {
                        setTicketsSeleccionados(prev => prev.filter(id => id !== ticket.id));
                      } else {
                        setTicketsSeleccionados(prev => [...prev, ticket.id]);
                      }
                    }}
                    className={`flex items-center justify-between py-2.5 px-3.5 rounded-2xl cursor-pointer transition-all duration-300 border mt-1.5 ${
                      seleccionado
                        ? "bg-violet-50/50 border-violet-200/60 shadow-sm"
                        : "bg-slate-50/30 border-transparent hover:bg-slate-50 hover:border-slate-100"
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={seleccionado}
                        onChange={(e) => {
                          e.stopPropagation();
                          if (seleccionado) {
                            setTicketsSeleccionados(prev => prev.filter(id => id !== ticket.id));
                          } else {
                            setTicketsSeleccionados(prev => [...prev, ticket.id]);
                          }
                        }}
                        className="rounded border-slate-300 text-violet-650 focus:ring-violet-500 h-4.5 w-4.5 cursor-pointer"
                      />
                      <div className="min-w-0 flex-1" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-800 text-sm tracking-tight truncate max-w-[140px] md:max-w-none">{descProd}</span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border tracking-wide uppercase ${badgeStyle}`}>
                            {linea || "General"}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            #{ticket.id}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
                          <span>Precio/Kg: ${fmt(prod ? Number(prod.precio_1_detalle) : 0)}</span>
                          <span className="opacity-40">•</span>
                          <span>{new Date(ticket.created_at).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Weight Adjustment Inputs */}
                    <div className="flex items-center gap-1.5 ml-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => actualizarPesoTicket(ticket.id, Math.max(0.001, Number(ticket.peso) - 0.05))}
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors text-xs font-bold"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        step="0.001"
                        min="0.001"
                        value={ticket.peso}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => actualizarPesoTicket(ticket.id, parseFloat(e.target.value) || 0)}
                        className="w-16 text-center font-mono text-xs font-bold border border-slate-200 rounded-lg py-1 px-1 focus:outline-none focus:ring-1 focus:ring-violet-500 focus:border-violet-500 bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => actualizarPesoTicket(ticket.id, Number(ticket.peso) + 0.05)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors text-xs font-bold"
                      >
                        +
                      </button>
                    </div>

                    <div className="text-right min-w-[75px] ml-3" onClick={(e) => e.stopPropagation()}>
                      <span className="font-mono font-bold text-slate-900 text-sm block">
                        ${fmt(Number(ticket.monto_usd))}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono block leading-none">
                        Bs. {fmt(Number(ticket.monto_usd) * tasaBcv)}
                      </span>
                    </div>

                    {/* Cancel Ticket Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        eliminarTicket(ticket.id);
                      }}
                      className="ml-3 p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-600 transition-all"
                      title="Cancelar y anular ticket"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* BACKUP LOCAL SCALE IN CAJA */}
        <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm hover:shadow-md transition-all duration-300">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Acceso rápido por peso (Balanza Local Caja)</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setTabPesado("carniceria")}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors duration-300 ${
                tabPesado === "carniceria" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              🥩 Carnicería
            </button>
            <button
              type="button"
              onClick={() => setTabPesado("verduleria")}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors duration-300 ${
                tabPesado === "verduleria" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              🍅 Verdulería
            </button>
            <button
              type="button"
              onClick={() => setTabPesado("charcuteria")}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors duration-300 ${
                tabPesado === "charcuteria" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              🧀 Charcutería
            </button>
          </div>
          
          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
            {productosPesadosFiltrados.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { setPesoModal(p); setPesoInput(""); }}
                className="bg-slate-50 hover:bg-blue-50 border border-slate-100 rounded-2xl p-3 text-left transition-all"
              >
                <p className="font-bold text-slate-800 text-sm line-clamp-1">{p.nombre}</p>
                <p className="mt-1 text-xs text-slate-500 font-mono">${fmt(Number(p.precio_1_detalle))} / Kg</p>
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* --- Modal de Peso (Balanza Local) --- */}
      {pesoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-black tracking-tight text-slate-900">{pesoModal.nombre}</h3>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-400">${fmt(Number(pesoModal.precio_1_detalle))} / Kg</p>
            <label className="mt-4 flex flex-col">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Peso en Kilogramos</span>
              <input
                type="number"
                step="0.001"
                min="0"
                autoFocus
                value={pesoInput}
                onChange={(e) => setPesoInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") confirmarPeso(); }}
                placeholder="0.750"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => { setPesoModal(null); setPesoInput(""); }}
                className="flex-1 rounded-2xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-600 transition-colors duration-300 hover:bg-slate-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarPeso}
                className="flex-1 rounded-2xl bg-blue-600 py-2.5 text-sm font-bold text-white transition-colors duration-300 hover:bg-blue-700"
              >
                Agregar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Checkout Panel (Right Column) --- */}
      <aside className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm hover:shadow-md transition-all duration-300 h-fit sticky top-6">
        <div className="flex items-center justify-between border-b border-slate-50 pb-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Liquidación POS</p>
          <span className="rounded-full bg-blue-50 border border-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700">
            {cliente.nombre}
          </span>
        </div>

        {/* COLLAPSIBLE CLIENT PURCHASE HISTORY (Marketing promo aid) */}
        <div className="mt-3 border border-slate-100 rounded-2xl bg-slate-50/50 overflow-hidden animate-fade-in">
          <button
            type="button"
            onClick={() => setMostrarHistorialCaja(!mostrarHistorialCaja)}
            className="w-full flex justify-between items-center px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider hover:bg-slate-100/50 transition-colors"
          >
            <span>📜 Historial Cliente ({historialCompras.length})</span>
            <span>{mostrarHistorialCaja ? "▲" : "▼"}</span>
          </button>

          {mostrarHistorialCaja && (
            <div className="p-3 border-t border-slate-100 bg-white space-y-1.5 max-h-48 overflow-y-auto">
              {cargandoHistorial ? (
                <p className="text-[10px] text-slate-400 animate-pulse">Cargando compras...</p>
              ) : historialCompras.length === 0 ? (
                <p className="text-[10px] text-slate-400">Sin historial registrado.</p>
              ) : (
                historialCompras.slice(0, limiteHistorial).map((ticket) => {
                  const prod = dbProductos.find(p => p.id === ticket.producto_id);
                  const name = prod ? prod.nombre : `Producto #${ticket.producto_id}`;
                  const dateStr = new Date(ticket.created_at).toLocaleDateString("es-VE", {
                    day: "numeric",
                    month: "short"
                  });
                  return (
                    <div key={ticket.id} className="flex justify-between items-center text-[10px] text-slate-600 border-b border-slate-50 pb-1.5 last:border-0 last:pb-0">
                      <div>
                        <span className="font-bold text-slate-700 block line-clamp-1">{name}</span>
                        <span className="text-[9px] text-slate-400 font-mono">{dateStr} · {fmtKg(Number(ticket.peso))} kg</span>
                      </div>
                      <span className="font-mono font-semibold text-slate-700">${fmt(Number(ticket.monto_usd))}</span>
                    </div>
                  );
                })
              )}
              {historialCompras.length > limiteHistorial && (
                <button
                  type="button"
                  onClick={() => setLimiteHistorial(prev => prev + 5)}
                  className="w-full text-center text-[9px] text-blue-600 font-bold mt-1.5 hover:underline"
                >
                  Cargar más +
                </button>
              )}
            </div>
          )}
        </div>

        {/* Balance summaries */}
        <div className="mt-4 space-y-2.5 text-xs text-slate-600 border-b border-slate-100 pb-4">
          <div className="flex justify-between">
            <span>Subtotal Artículos Estante:</span>
            <span className="font-mono">${fmt(totalCarritoUsd)}</span>
          </div>
          <div className="flex justify-between">
            <span>Subtotal Tickets Balanza:</span>
            <span className="font-mono text-blue-600 font-semibold">${fmt(totalBalanzaUsd)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-50 pt-2.5 text-slate-800 text-sm font-bold">
            <span>TOTAL CUENTA:</span>
            <span className="font-mono text-lg text-slate-900">${fmt(totalUsd)}</span>
          </div>
          <div className="flex justify-between text-slate-500 font-mono text-[10px]">
            <span>TOTAL EN BOLÍVARES:</span>
            <span>Bs. {fmt(totalVes)}</span>
          </div>
          <p className="text-[10px] text-slate-400 tracking-wider">Tasa BCV de Cambio: Bs. {fmt(tasaBcv)}</p>
        </div>

        {/* Payment Methods */}
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Método de pago</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {METODOS_PAGO.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetodoPago(m)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors duration-300 ${
                  metodoPago === m ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Dynamic Payment Fields */}
        <div className="mt-4 p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-3">
          {metodoPago === "Punto de Venta" && (
            <>
              <div>
                <span className="text-xs font-bold text-slate-400">Tipo de Tarjeta</span>
                <div className="mt-1 inline-flex rounded-xl bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setTipoTarjeta("TDD")}
                    className={`rounded-lg px-3 py-1 text-xs font-bold transition-colors duration-300 ${
                      tipoTarjeta === "TDD" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                    }`}
                  >
                    TDD
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipoTarjeta("TDC")}
                    className={`rounded-lg px-3 py-1 text-xs font-bold transition-colors duration-300 ${
                      tipoTarjeta === "TDC" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                    }`}
                  >
                    TDC
                  </button>
                </div>
              </div>
              <label className="flex flex-col">
                <span className="text-xs font-bold text-slate-400">Número de Comprobante (Voucher)</span>
                <input
                  value={numComprobante}
                  onChange={(e) => setNumComprobante(e.target.value)}
                  placeholder="Ej: 0245"
                  className={inputClsSmall}
                  required
                />
              </label>
            </>
          )}

          {metodoPago === "Pago Móvil" && (
            <>
              <label className="flex flex-col">
                <span className="text-xs font-bold text-slate-400">Número de Referencia</span>
                <input
                  value={referenciaPagoMovil}
                  onChange={(e) => setReferenciaPagoMovil(e.target.value)}
                  placeholder="Ej: 987654"
                  className={inputClsSmall}
                  required
                />
              </label>
              <label className="flex flex-col">
                <span className="text-xs font-bold text-slate-400">Capture de Pantalla del Pago</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setCapturePagoMovilName(e.target.files?.[0]?.name ?? "")}
                  className="mt-1 block w-full text-xs text-slate-500 file:mr-3 file:rounded-full file:border-0 file:bg-slate-950 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white file:transition-colors file:duration-300 hover:file:bg-slate-700"
                  required
                />
                {capturePagoMovilName && <span className="mt-1 text-xs text-slate-500">Archivo: {capturePagoMovilName}</span>}
              </label>
            </>
          )}

          {(metodoPago === "Efectivo $" || metodoPago === "Efectivo Bs") && (
            <>
              <label className="flex flex-col">
                <span className="text-xs font-bold text-slate-400">Monto Recibido ({metodoPago === "Efectivo Bs" ? "Bs" : "$"})</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={montoRecibido}
                  onChange={(e) => setMontoRecibido(e.target.value)}
                  placeholder="0.00"
                  className={inputClsSmall}
                />
              </label>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Vuelto</span>
                <span className={`text-lg font-black ${vuelto < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                  {metodoPago === "Efectivo Bs" ? "Bs. " : "$"}{fmt(Math.max(vuelto, 0))}
                </span>
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={procesarCobroFinal}
          disabled={cobrarDeshabilitado}
          className="mt-6 w-full rounded-2xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-sm transition-all duration-300 hover:bg-blue-700 hover:shadow-md disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
        >
          {procesandoPago ? "Procesando Cobro..." : `Cobrar (${metodoPago})`}
        </button>
      </aside>

      {/* --- Modal de Factura / Recibo de Pago --- */}
      {pagoCompletadoData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 relative overflow-hidden animate-slide-up">
            
            {/* Header info */}
            <div className="bg-slate-950 text-white text-[10px] font-bold py-1 text-center absolute top-0 left-0 right-0 tracking-widest uppercase">
              Transacción Exitosa
            </div>

            <div className="border border-slate-200 rounded-2xl p-5 mt-4 bg-slate-50 border-dashed space-y-4">
              <div className="text-center">
                <h4 className="font-black text-slate-800 text-base">MINIMARKET EL VAIVÉN</h4>
                <p className="text-[9px] text-slate-400 tracking-wider">TICKET DE FACTURACIÓN NRO: {pagoCompletadoData.facturaNum}</p>
                <p className="text-[8px] text-slate-400">FECHA: {pagoCompletadoData.fecha} · MÓDULO: CAJA POS</p>
              </div>

              {/* Client information */}
              <div className="text-xs space-y-1 bg-white border border-slate-100 p-3 rounded-xl">
                <div className="flex justify-between">
                  <span className="text-slate-400">Cliente:</span>
                  <span className="text-slate-800 font-bold">{pagoCompletadoData.clienteName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Cédula:</span>
                  <span className="text-slate-800 font-mono">{pagoCompletadoData.clienteCedula}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Método de Pago:</span>
                  <span className="text-slate-800 font-semibold">{pagoCompletadoData.metodoPago}</span>
                </div>
              </div>

              {/* Breakdown by department / section */}
              <div className="text-xs space-y-2 border-t border-slate-200/60 pt-3 font-medium">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Desglose de Compra</p>
                
                {pagoCompletadoData.totalCarritoUsd > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>🛒 Artículos de Estante:</span>
                    <span className="font-mono">${fmt(pagoCompletadoData.totalCarritoUsd)}</span>
                  </div>
                )}

                {Object.entries(pagoCompletadoData.porDepartamento).map(([dept, total]) => {
                  if ((total as number) <= 0) return null;
                  const emoji = dept === "Carnicería" ? "🥩" : dept === "Verdulería" ? "🍅" : dept === "Charcutería" ? "🧀" : "📦";
                  return (
                    <div key={dept} className="flex justify-between text-slate-600 pl-2">
                      <span>{emoji} Pedidos {dept}:</span>
                      <span className="font-mono">${fmt(total as number)}</span>
                    </div>
                  );
                })}

                <div className="flex justify-between border-t border-slate-200/60 pt-2 text-slate-800 text-sm font-bold">
                  <span>TOTAL COBRADO USD:</span>
                  <span className="text-emerald-600 font-black font-mono">${fmt(pagoCompletadoData.totalUsd)}</span>
                </div>
                <div className="flex justify-between text-slate-500 text-[10px] font-mono">
                  <span>TOTAL COBRADO VES:</span>
                  <span>Bs. {fmt(pagoCompletadoData.totalVes)}</span>
                </div>

                <div className="flex justify-between border-t border-slate-200/40 pt-1.5 text-xs text-slate-600">
                  <span>Monto Recibido:</span>
                  <span className="font-mono">
                    {pagoCompletadoData.metodoPago === "Efectivo Bs" ? "Bs. " : "$"}
                    {fmt(pagoCompletadoData.montoRecibido)}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-slate-600">
                  <span>Vuelto:</span>
                  <span className="text-emerald-600 font-bold font-mono">
                    {pagoCompletadoData.metodoPago === "Efectivo Bs" ? "Bs. " : "$"}
                    {fmt(pagoCompletadoData.vuelto)}
                  </span>
                </div>
              </div>

              {/* Barcode representation */}
              <div className="flex flex-col items-center py-2 bg-white rounded-xl border border-slate-100">
                <div className="flex justify-center gap-0.5 h-8 w-44 items-stretch">
                  {[...Array(20)].map((_, idx) => {
                    const width = (idx % 2 === 0) ? "w-1" : (idx % 5 === 0) ? "w-1.5" : "w-[2px]";
                    return <div key={idx} className={`${width} bg-slate-800`}></div>;
                  })}
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={() => setMostrarEnvioDelivery(true)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-2xl py-3 text-sm font-bold transition-all shadow-md"
              >
                🚚 Enviar por Delivery
              </button>
              <button
                type="button"
                onClick={() => {
                  setPagoCompletadoData(null);
                  cerrarTicket();
                }}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-2xl py-3 text-sm font-bold transition-all shadow-md"
              >
                ✓ Cerrar y Nueva Venta
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ENVÍO POR DELIVERY DE LA VENTA RECIÉN COBRADA */}
      {mostrarEnvioDelivery && pagoCompletadoData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-white rounded-3xl border border-slate-200 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setMostrarEnvioDelivery(false)}
              className="absolute top-4 right-4 z-10 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full w-8 h-8 flex items-center justify-center font-bold transition-all"
              title="Cerrar"
            >
              ✕
            </button>
            <DeliveryOrderForm
              initialData={{
                cliente_nombre: pagoCompletadoData.clienteName,
                monto_total: pagoCompletadoData.totalUsd.toFixed(2),
                metodo_pago: pagoCompletadoData.metodoPago,
              }}
              onOrderCreated={() => {
                setMostrarEnvioDelivery(false);
                setPagoCompletadoData(null);
                cerrarTicket();
              }}
            />
          </div>
        </div>
      )}

      </div> {/* Closing grid */}

      {/* RESOLUTION MODAL FOR PENDING COMPLAINTS */}
      {mostrarResolucionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 relative overflow-hidden animate-slide-up">
            
            <div className="bg-rose-600 text-white text-[10px] font-bold py-1.5 text-center absolute top-0 left-0 right-0 tracking-widest uppercase">
              Quejas y Alertas de Calidad del Cliente
            </div>

            <div className="space-y-4 mt-6">
              <div>
                <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Historial de Calidad de</h4>
                <p className="font-bold text-slate-850 text-lg mt-0.5">{cliente.nombre}</p>
                <p className="text-xs text-slate-500 font-mono">Cédula: {cliente.cedula}</p>
              </div>

              <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                {encuestasPendientes.map((log) => {
                  return (
                    <div key={log.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-full uppercase">
                            Queja Pendiente
                          </span>
                          <span className="text-slate-400 text-[10px] block mt-1 font-mono">
                            Registrado el: {new Date(log.created_at).toLocaleDateString("es-VE")}
                          </span>
                        </div>
                      </div>

                      <div className="text-xs text-slate-700 bg-white border border-slate-100 p-2.5 rounded-xl">
                        <span className="font-bold text-slate-500 block text-[10px] uppercase">Detalle del problema:</span>
                        {log.respuesta_cliente}
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase block">Solución Aplicada en Caja</label>
                        <input
                          type="text"
                          value={resolucionComentario}
                          onChange={(e) => setResolucionComentario(e.target.value)}
                          placeholder="Ej. Se le cambió el producto / Se le dio descuento de 10%..."
                          className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-rose-500 bg-white"
                        />
                      </div>

                      {resolucionError && (
                        <p className="text-xs font-semibold text-rose-600 bg-rose-50 p-2 rounded-xl">{resolucionError}</p>
                      )}

                      <button
                        type="button"
                        onClick={() => resolverEncuesta(log.id)}
                        disabled={guardandoResolucion}
                        className="w-full bg-emerald-600 hover:bg-emerald-750 text-white rounded-xl py-2 text-xs font-bold transition-all disabled:opacity-50"
                      >
                        {guardandoResolucion ? "Procesando..." : "✓ Resolver y Cerrar Alerta"}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-slate-100 pt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setMostrarResolucionModal(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl px-4 py-2 text-xs font-bold transition-all"
                >
                  Cerrar
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
