import { useState, useEffect, useMemo, useCallback } from "react";
import apiClient from "../api/client";
import ModuloDesposte from "./ModuloDesposte";
import { normalizeDept, DEPARTAMENTOS_PESAJE } from "../lib/departamentos";
import { APP_NAME } from "../config/brand";

const labelClsAlta = "text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1";
const inputClsAlta = "rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";

interface ProductoBalanza {
  id: number;
  codigo_interno: string;
  nombre: string;
  precio_1_detalle: number;
  linea?: string | null;
  stock_total?: number;
}

interface ClienteBalanza {
  id: number;
  nombre: string;
  cedula: string;
  telefono?: string;
  email?: string;
}

interface TicketResponseData {
  id: number;
  producto_id: number;
  cliente_id: number;
  peso: number;
  monto_usd: number;
  status: string;
  created_at: string;
}

// Las claves deben ser idénticas a DEPARTAMENTOS_PESAJE (lib/departamentos.ts): es lo mismo
// que usa ModalSolicitudDesposte.tsx (Caja) para etiquetar a qué departamento va la solicitud.
// Antes esta lista vivía duplicada aquí con "Verdulería" en vez de "Verdulería y Frutas",
// así que una solicitud de Caja para ese depto nunca calzaba con ningún deptActivo posible.
const ROL_POR_DEPARTAMENTO: Record<string, string> = {
  "Carnicería": "carnicero",
  "Verdulería y Frutas": "verdulero",
  "Charcutería": "charcutero",
};
const DEPARTAMENTOS = DEPARTAMENTOS_PESAJE.map((d) => ({
  key: d.key,
  label: d.label,
  roleRequired: ROL_POR_DEPARTAMENTO[d.key],
}));

// Decodifica el claim "rol" del JWT sin librerías externas
function getRolFromToken(): string | null {
  const token = localStorage.getItem("access_token");
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.rol ?? null;
  } catch {
    return null;
  }
}

export default function ModuloBalanza() {
  const [tasaBcv, setTasaBcv] = useState(602.33);
  const [tasaEur, setTasaEur] = useState<number | null>(null);
  const [masterProductos, setMasterProductos] = useState<ProductoBalanza[]>([]);
  const [productos, setProductos] = useState<ProductoBalanza[]>([]);
  const [loadingProds, setLoadingProds] = useState(false);
  const [errorText, setErrorText] = useState("");

  // Role and department state
  const [userRol, setUserRol] = useState<string | null>(null);
  const [deptActivo, setDeptActivo] = useState("Carnicería");

  // Client management states
  const [cedulaInput, setCedulaInput] = useState("V-");
  const [cliente, setCliente] = useState<ClienteBalanza | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [mostrarRegistroExpress, setMostrarRegistroExpress] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [telefonoNuevo, setTelefonoNuevo] = useState("");
  const [clientError, setClientError] = useState("");

  // Client purchase history
  const [historialCompras, setHistorialCompras] = useState<any[]>([]);
  const [limiteHistorial, setLimiteHistorial] = useState(5);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  // Tickets pendientes de TODA la empresa (no solo del cliente identificado): así nunca
  // desaparecen al cambiar de departamento/vista y se puede dar seguimiento a varios
  // clientes en paralelo. Se cancelan únicamente desde Caja; aquí solo se anulan los del
  // cliente activo (devolución en el momento del pesaje).
  const [pendientesGlobales, setPendientesGlobales] = useState<any[]>([]);
  const [cargandoPendientes, setCargandoPendientes] = useState(false);

  // Product Selection & Weight simulation
  const [productoSel, setProductoSel] = useState<ProductoBalanza | null>(null);
  const [pesoInput, setPesoInput] = useState("0.000");
  const [tara, setTara] = useState(0.0);
  const [guardandoPesaje, setGuardandoPesaje] = useState(false);

  // Desposte (descomponer un producto entero en sus cortes resultantes)
  const [mostrarDesposte, setMostrarDesposte] = useState(false);
  // Solicitudes de desposte creadas por Caja, pendientes de que Balanza las ejecute
  const [solicitudesPendientes, setSolicitudesPendientes] = useState<any[]>([]);
  const [solicitudEnEjecucion, setSolicitudEnEjecucion] = useState<any | null>(null);

  // Alta rápida de producto directamente desde Balanza (linea/tipo_venta fijados al depto activo,
  // a prueba de typos por construcción, en vez de tener que ir a Ingreso de Datos)
  const [mostrarAltaRapida, setMostrarAltaRapida] = useState(false);
  const [altaRapidaForm, setAltaRapidaForm] = useState({ nombre: "", codigo_interno: "", costo_usd: "", precio_1_detalle: "", peso: "" });
  const [guardandoAltaRapida, setGuardandoAltaRapida] = useState(false);
  const [altaRapidaError, setAltaRapidaError] = useState("");

  async function crearProductoRapido() {
    setAltaRapidaError("");
    if (!altaRapidaForm.nombre.trim() || !altaRapidaForm.codigo_interno.trim()) {
      setAltaRapidaError("Nombre y código interno son obligatorios.");
      return;
    }
    setGuardandoAltaRapida(true);
    try {
      await apiClient.post("/api/v1/productos", {
        codigo_interno: altaRapidaForm.codigo_interno.trim(),
        nombre: altaRapidaForm.nombre.trim(),
        linea: deptActivo,
        tipo_venta: "peso",
        costo_usd: altaRapidaForm.costo_usd || "0",
        precio_1_detalle: altaRapidaForm.precio_1_detalle || "0",
        peso: altaRapidaForm.peso || null,
      });
      setMostrarAltaRapida(false);
      setAltaRapidaForm({ nombre: "", codigo_interno: "", costo_usd: "", precio_1_detalle: "", peso: "" });
      setLoadingProds(true);
      const res = await apiClient.get<ProductoBalanza[]>("/api/v1/productos");
      setMasterProductos(res.data);
      setLoadingProds(false);
    } catch (err: any) {
      setAltaRapidaError(err.response?.data?.detail ?? "No se pudo crear el producto.");
    } finally {
      setGuardandoAltaRapida(false);
    }
  }

  // Survey states
  const [surveyTicket, setSurveyTicket] = useState<any | null>(null);
  const [surveyProductName, setSurveyProductName] = useState("");
  const [surveyOption, setSurveyOption] = useState("Excelente");
  const [surveyComment, setSurveyComment] = useState("");
  const [surveyError, setSurveyError] = useState("");
  const [guardandoSurvey, setGuardandoSurvey] = useState(false);
  const [surveySuccessMessage, setSurveySuccessMessage] = useState("");

  // Sticker simulation state
  const [printedTicket, setPrintedTicket] = useState<{
    id: number;
    cliente: ClienteBalanza;
    producto: ProductoBalanza;
    peso: number;
    montoUsd: number;
    montoVes: number;
    departamento: string;
    fecha: string;
  } | null>(null);

  // Fetch BCV Rate and all master products on mount
  useEffect(() => {
    apiClient.get("/api/v1/tasa")
      .then((res) => {
        if (res.data && res.data.valor_bcv) {
          setTasaBcv(Number(res.data.valor_bcv));
        }
        if (res.data && res.data.valor_eur) {
          setTasaEur(Number(res.data.valor_eur));
        }
      })
      .catch(() => {});

    setLoadingProds(true);
    apiClient.get<ProductoBalanza[]>("/api/v1/productos")
      .then((res) => {
        setMasterProductos(res.data);
      })
      .catch((err) => {
        console.error("Error al cargar productos:", err);
        setErrorText("No se pudo cargar el catálogo de productos.");
      })
      .finally(() => {
        setLoadingProds(false);
      });
  }, []);

  // Set initial department based on user role
  useEffect(() => {
    const rol = getRolFromToken();
    setUserRol(rol);
    if (rol === "carnicero") {
      setDeptActivo("Carnicería");
    } else if (rol === "verdulero") {
      setDeptActivo("Verdulería y Frutas");
    } else if (rol === "charcutero") {
      setDeptActivo("Charcutería");
    } else {
      setDeptActivo("Carnicería"); // Default for owner / admin
    }
  }, []);

  // Filter products matching the active department
  useEffect(() => {
    const targetNormalized = normalizeDept(deptActivo);
    const filtered = masterProductos.filter(p => normalizeDept(p.linea) === targetNormalized);
    setProductos(filtered);
  }, [deptActivo, masterProductos]);

  // Clean selection if department changes
  useEffect(() => {
    setProductoSel(null);
    setPesoInput("0.000");
  }, [deptActivo]);

  // Cola de solicitudes de desposte pendientes, creadas por Caja para el departamento activo
  const cargarSolicitudesPendientes = useCallback(() => {
    apiClient.get("/api/v1/desposte-solicitudes", { params: { departamento: deptActivo, estatus: "pendiente" } })
      .then((res) => setSolicitudesPendientes(res.data))
      .catch(() => setSolicitudesPendientes([]));
  }, [deptActivo]);

  useEffect(() => {
    cargarSolicitudesPendientes();
    const t = setInterval(cargarSolicitudesPendientes, 15000);
    return () => clearInterval(t);
  }, [cargarSolicitudesPendientes]);

  // Historial de lo ya ejecutado/verificado/cancelado por este departamento (auditoría de Balanza)
  const [mostrarHistorialBalanza, setMostrarHistorialBalanza] = useState(false);
  const [historialBalanza, setHistorialBalanza] = useState<any[]>([]);
  const cargarHistorialBalanza = useCallback(() => {
    Promise.all([
      apiClient.get("/api/v1/desposte-solicitudes", { params: { departamento: deptActivo, estatus: "completado" } }),
      apiClient.get("/api/v1/desposte-solicitudes", { params: { departamento: deptActivo, estatus: "verificado" } }),
      apiClient.get("/api/v1/desposte-solicitudes", { params: { departamento: deptActivo, estatus: "cancelado" } }),
    ])
      .then(([completadas, verificadas, canceladas]) => {
        const todas = [...completadas.data, ...verificadas.data, ...canceladas.data].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setHistorialBalanza(todas);
      })
      .catch(() => setHistorialBalanza([]));
  }, [deptActivo]);

  useEffect(() => {
    if (mostrarHistorialBalanza) cargarHistorialBalanza();
  }, [deptActivo, mostrarHistorialBalanza, cargarHistorialBalanza]);

  // Check Cédula
  async function buscarCliente() {
    const cedula = cedulaInput.trim().toUpperCase();
    if (!cedula || cedula === "V-") {
      setClientError("Debe ingresar una cédula válida.");
      return;
    }
    setClientError("");
    setVerificando(true);
    setCliente(null);
    setMostrarRegistroExpress(false);
    setHistorialCompras([]);

    try {
      const { data } = await apiClient.get<ClienteBalanza[]>("/api/v1/clientes", { params: { cedula } });
      if (data.length > 0) {
        setCliente(data[0]);
        cargarHistorialCompras(data[0].id);
      } else {
        setMostrarRegistroExpress(true);
      }
    } catch (err) {
      setClientError("Error al consultar el cliente.");
      console.error(err);
    } finally {
      setVerificando(false);
    }
  }

  // Retoma a un cliente que ya tiene pedidos pendientes en balanza (de la lista global),
  // sin tener que volver a pedirle la cédula: así se puede atender a varios clientes en paralelo.
  async function atenderCliente(clienteId: number) {
    setClientError("");
    setVerificando(true);
    setMostrarRegistroExpress(false);
    setHistorialCompras([]);

    try {
      const { data } = await apiClient.get<ClienteBalanza[]>("/api/v1/clientes", { params: { cliente_id: clienteId } });
      if (data.length > 0) {
        setCliente(data[0]);
        setCedulaInput(data[0].cedula);
        cargarHistorialCompras(data[0].id);
      }
    } catch (err) {
      setClientError("No se pudo cargar el cliente seleccionado.");
      console.error(err);
    } finally {
      setVerificando(false);
    }
  }

  // Register Express
  async function registrarCliente() {
    const cedula = cedulaInput.trim().toUpperCase();
    const nombre = nombreNuevo.trim();
    if (!nombre) {
      setClientError("El Nombre Completo es obligatorio.");
      return;
    }
    setClientError("");
    setVerificando(true);

    try {
      const { data } = await apiClient.post<ClienteBalanza>("/api/v1/clientes", {
        cedula,
        nombre,
        telefono: telefonoNuevo.trim() || undefined
      });
      setCliente(data);
      setHistorialCompras([]);
      setMostrarRegistroExpress(false);
      setNombreNuevo("");
      setTelefonoNuevo("");
    } catch (err) {
      setClientError("No se pudo registrar el cliente de forma express.");
      console.error(err);
    } finally {
      setVerificando(false);
    }
  }

  // Load client purchase history
  async function cargarHistorialCompras(clienteId: number) {
    setCargandoHistorial(true);
    setLimiteHistorial(5);
    try {
      const { data } = await apiClient.get<any[]>("/api/v1/tickets", {
        params: { cliente_id: clienteId, status: "procesado" }
      });
      // Sort descending (most recent first)
      const sorted = data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setHistorialCompras(sorted);
    } catch (err) {
      console.error("Error al cargar historial:", err);
    } finally {
      setCargandoHistorial(false);
    }
  }

  // Carga TODOS los tickets pendientes de la empresa (no solo del cliente identificado).
  // Se llama al montar, cada ~12s, y tras cualquier acción que cree/anule/edite un pesaje,
  // así nunca desaparecen al cambiar de departamento o de cliente.
  const cargarPendientesGlobales = useCallback(() => {
    setCargandoPendientes(true);
    apiClient.get<any[]>("/api/v1/tickets", { params: { status: "pendiente" } })
      .then((res) => {
        const sorted = res.data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setPendientesGlobales(sorted);
      })
      .catch((err) => console.error("Error al cargar tickets pendientes en balanza:", err))
      .finally(() => setCargandoPendientes(false));
  }, []);

  useEffect(() => {
    cargarPendientesGlobales();
    const intervalo = setInterval(cargarPendientesGlobales, 12000);
    return () => clearInterval(intervalo);
  }, [cargarPendientesGlobales]);

  // Tickets pendientes del cliente actualmente identificado (derivados de la lista global)
  const ticketsClienteActivo = useMemo(() => {
    if (!cliente) return [];
    return pendientesGlobales.filter((t) => t.cliente_id === cliente.id);
  }, [pendientesGlobales, cliente]);

  // Consolida los tickets pendientes por producto: evita mostrar el mismo producto
  // repetido cuando se pesó varias veces en la misma visita, sumando peso y monto.
  // "ticketObjetivoId" es el pesaje más reciente del grupo: es el que se ajusta
  // cuando el usuario modifica o agrega peso desde la tarjeta consolidada.
  const ticketsAgrupados = useMemo(() => {
    const grupos = new Map<number, {
      producto_id: number; peso: number; monto_usd: number; created_at: string;
      ids: number[]; ticketObjetivoId: number;
    }>();
    for (const ticket of ticketsClienteActivo) {
      const existente = grupos.get(ticket.producto_id);
      if (existente) {
        existente.peso += Number(ticket.peso);
        existente.monto_usd += Number(ticket.monto_usd);
        existente.ids.push(ticket.id);
        if (new Date(ticket.created_at).getTime() > new Date(existente.created_at).getTime()) {
          existente.created_at = ticket.created_at;
          existente.ticketObjetivoId = ticket.id;
        }
      } else {
        grupos.set(ticket.producto_id, {
          producto_id: ticket.producto_id,
          peso: Number(ticket.peso),
          monto_usd: Number(ticket.monto_usd),
          created_at: ticket.created_at,
          ids: [ticket.id],
          ticketObjetivoId: ticket.id
        });
      }
    }
    return Array.from(grupos.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [ticketsClienteActivo]);

  // Agrupa TODOS los pendientes por cliente, para la lista global de seguimiento
  // (despacho y pago en Caja), independiente de cuál cliente esté identificado ahora.
  const pendientesPorCliente = useMemo(() => {
    const grupos = new Map<number, { cliente_id: number; cliente_nombre: string; cantidad_tickets: number; monto_total: number; created_at: string }>();
    for (const t of pendientesGlobales) {
      const existente = grupos.get(t.cliente_id);
      if (existente) {
        existente.cantidad_tickets += 1;
        existente.monto_total += Number(t.monto_usd);
        if (new Date(t.created_at).getTime() > new Date(existente.created_at).getTime()) {
          existente.created_at = t.created_at;
        }
      } else {
        grupos.set(t.cliente_id, {
          cliente_id: t.cliente_id,
          cliente_nombre: t.cliente ?? `Cliente #${t.cliente_id}`,
          cantidad_tickets: 1,
          monto_total: Number(t.monto_usd),
          created_at: t.created_at,
        });
      }
    }
    return Array.from(grupos.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [pendientesGlobales]);

  // Anula todos los pesajes pendientes que componen un grupo (ej. el cliente se devuelve el producto)
  async function cancelarGrupoPendiente(ids: number[]) {
    try {
      await Promise.all(ids.map((id) => apiClient.put(`/api/v1/tickets/${id}/cancelar`)));
      cargarPendientesGlobales();
    } catch (err) {
      console.error("Error al cancelar el pesaje:", err);
      setErrorText("No se pudo anular el pesaje seleccionado.");
    }
  }

  // Ajusta el peso total del grupo aplicando la diferencia al pesaje más reciente
  // (el resto de los pesajes del grupo no se tocan). Permite "agregar más" o corregir
  // un pesaje sin tener que anular y repetir todo.
  async function actualizarPesoGrupo(grupo: { peso: number; ticketObjetivoId: number }, nuevoPesoTotal: number) {
    if (isNaN(nuevoPesoTotal)) return;

    const ticketObjetivo = pendientesGlobales.find((t) => t.id === grupo.ticketObjetivoId);
    if (!ticketObjetivo) return;

    const pesoRestoDelGrupo = grupo.peso - Number(ticketObjetivo.peso);
    const nuevoPesoObjetivo = Number((nuevoPesoTotal - pesoRestoDelGrupo).toFixed(3));

    if (nuevoPesoObjetivo <= 0) {
      setErrorText("El peso no puede quedar en cero. Use el botón de anular si desea eliminar el pesaje.");
      return;
    }

    try {
      await apiClient.put(`/api/v1/tickets/${grupo.ticketObjetivoId}/peso`, { peso: nuevoPesoObjetivo });
      cargarPendientesGlobales();
    } catch (err: any) {
      console.error("Error al modificar el peso del pesaje:", err);
      setErrorText(err.response?.data?.detail ?? "No se pudo modificar el peso del pesaje.");
    }
  }

  // Scale simulation helpers
  function simularPesoRandom() {
    const randomWeight = (Math.random() * (3.5 - 0.15) + 0.15).toFixed(3);
    setPesoInput(randomWeight);
  }

  // Adjust weight incrementally
  function ajustarPeso(delta: number) {
    const actual = Math.max(0, (Number(pesoInput) || 0) + delta);
    setPesoInput(actual.toFixed(3));
  }

  // Calculate prices
  const pesoNeto = Math.max(0, (Number(pesoInput) || 0) - tara);
  const totalUsd = productoSel ? pesoNeto * productoSel.precio_1_detalle : 0.0;
  const totalVes = totalUsd * tasaBcv;

  // Save weighing ticket
  async function guardarPesaje() {
    if (!cliente) {
      setClientError("Debe identificar al cliente antes de registrar el pesaje.");
      return;
    }
    if (!productoSel) {
      setErrorText("Debe seleccionar un producto del catálogo.");
      return;
    }
    if (pesoNeto <= 0) {
      setErrorText("El peso registrado debe ser mayor a cero.");
      return;
    }

    setGuardandoPesaje(true);
    setErrorText("");

    try {
      const { data } = await apiClient.post<TicketResponseData>("/api/v1/tickets/pesaje", {
        cliente_id: cliente.id,
        producto_id: productoSel.id,
        peso: pesoNeto
      });

      // Show printed ticket dialog
      setPrintedTicket({
        id: data.id,
        cliente: cliente,
        producto: productoSel,
        peso: pesoNeto,
        montoUsd: Number(data.monto_usd) || totalUsd,
        montoVes: (Number(data.monto_usd) || totalUsd) * tasaBcv,
        departamento: deptActivo,
        fecha: new Date().toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      });

      // Clear product and scale input, keep client so they can make another weighing
      setProductoSel(null);
      setPesoInput("0.000");
      setTara(0.0);
      cargarPendientesGlobales();
    } catch (err: any) {
      console.error(err);
      setErrorText(err.response?.data?.detail ?? "Error al guardar el pesaje en el servidor.");
    } finally {
      setGuardandoPesaje(false);
    }
  }

  // Open survey modal
  function openSurveyModal(ticket: any, prodName: string) {
    setSurveyTicket(ticket);
    setSurveyProductName(prodName);
    setSurveyOption("Excelente");
    setSurveyComment("");
    setSurveyError("");
    setSurveySuccessMessage("");
  }

  // Submit survey
  async function guardarEncuestaCalidad() {
    if (!surveyTicket) return;
    setGuardandoSurvey(true);
    setSurveyError("");
    setSurveySuccessMessage("");

    // Opciones negativas que activarán alerta titilante en caja
    const negativeOptions = ["Estaba dura / mala", "Ya no me gusta"];
    const isNegative = negativeOptions.includes(surveyOption) || (surveyOption === "Otro" && surveyComment.trim().length > 0);
    const status_envio = isNegative ? "pendiente" : "resuelto";

    const respuesta_cliente = surveyComment.trim() 
      ? `${surveyOption}: ${surveyComment.trim()}`
      : surveyOption;

    try {
      await apiClient.post("/api/v1/crm/postventa-logs", {
        ticket_id: surveyTicket.id,
        tipo_mensaje: "encuesta_calidad",
        respuesta_cliente: respuesta_cliente,
        status_envio: status_envio
      });
      setSurveySuccessMessage("¡Encuesta registrada con éxito!");
      setTimeout(() => {
        setSurveyTicket(null);
        setSurveySuccessMessage("");
      }, 1500);
    } catch (err: any) {
      console.error(err);
      setSurveyError(err.response?.data?.detail ?? "Error al registrar la encuesta.");
    } finally {
      setGuardandoSurvey(false);
    }
  }


  // Format currency helpers
  const fmt = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtKg = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  // Change active department (for admin/owners)
  const activeDeptObj = DEPARTAMENTOS.find(d => d.key === deptActivo);
  const matchesRole = userRol ? (userRol === activeDeptObj?.roleRequired || ["propietario", "admin"].includes(userRol)) : true;
  const disabledDeptSelector = !matchesRole;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 flex items-center gap-2">
            ⚖️ Balanza Digital Inteligente
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Estación descentralizada de pesaje por departamento · {APP_NAME}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-2 text-right">
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tasa BCV del Día</span>
            <span className="font-mono font-bold text-slate-700">Bs. {fmt(tasaBcv)}</span>
          </div>
          {tasaEur !== null && (
            <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-2 text-right">
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tasa Euro del Día</span>
              <span className="font-mono font-bold text-slate-700">Bs. {fmt(tasaEur)}</span>
            </div>
          )}
          <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-2">
            <span className="block text-[10px] font-bold text-blue-400 uppercase tracking-wider">Perfil Operativo</span>
            <span className="font-semibold text-blue-700 capitalize">{userRol ? userRol : "Cargando..."}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN: CLIENT VERIFICATION & SCALE SIMULATOR */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* CLIENT VERIFICATION CARD (Keep compact: Scale will always stay on top/visible) */}
          <section className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">🔍 Identificar Cliente</h3>
              {cliente && (
                <span className="bg-emerald-50 text-emerald-700 text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 animate-pulse">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> Identificado
                </span>
              )}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={cedulaInput}
                onChange={(e) => setCedulaInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === "Enter") buscarCliente(); }}
                placeholder="V-12345678"
                disabled={verificando}
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={buscarCliente}
                disabled={verificando || !cedulaInput.trim() || cedulaInput === "V-"}
                className="bg-slate-950 hover:bg-slate-800 text-white rounded-xl px-4 py-2 text-sm font-bold transition-all disabled:opacity-50"
              >
                {verificando ? "Buscando..." : "Buscar"}
              </button>
            </div>

            {clientError && <p className="text-xs font-semibold text-rose-600">{clientError}</p>}

            {/* Display client found */}
            {cliente && (
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex justify-between items-center animate-fade-in">
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">{cliente.nombre}</h4>
                  <p className="text-xs font-mono text-slate-500 mt-0.5">{cliente.cedula}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCliente(null);
                    setCedulaInput("V-");
                    setHistorialCompras([]);
                  }}
                  className="text-xs text-rose-600 hover:text-rose-700 font-bold bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded-lg transition-colors"
                >
                  Cambiar
                </button>
              </div>
            )}

            {/* Express registration */}
            {mostrarRegistroExpress && (
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-3 animate-fade-in">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cliente No Registrado · Registro Express</p>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Nombre y Apellido</label>
                  <input
                    type="text"
                    value={nombreNuevo}
                    onChange={(e) => setNombreNuevo(e.target.value)}
                    placeholder="Ej. Juan Pérez"
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Teléfono (Opcional)</label>
                  <input
                    type="text"
                    value={telefonoNuevo}
                    onChange={(e) => setTelefonoNuevo(e.target.value)}
                    placeholder="Ej. 04121234567"
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={registrarCliente}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2 text-xs font-bold transition-all"
                >
                  Registrar e Iniciar Pesaje
                </button>
              </div>
            )}
          </section>

          {/* BALANZA HARDWARE SIMULATOR (Always visible at the top/front plane) */}
          <section className="bg-slate-900 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden border border-slate-800">
            {/* LED display lines layout */}
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl"></div>
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Balanza Electrónica</span>
              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full">
                ONLINE
              </span>
            </div>

            {/* Scale main display - WITH MANUAL INPUT */}
            <div className="bg-black/40 border border-slate-800 rounded-2xl p-5 text-center shadow-inner relative">
              <div className="absolute top-2 left-3 text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                Peso Neto (Modificable Manual)
              </div>
              <div className="flex items-center justify-center gap-1.5 my-3">
                <input
                  type="text"
                  value={pesoInput}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const val = e.target.value;
                    // Allow numbers, empty string, and up to one decimal point
                    if (/^\d*\.?\d*$/.test(val)) {
                      setPesoInput(val);
                    }
                  }}
                  onBlur={() => {
                    if (pesoInput === "" || isNaN(Number(pesoInput))) {
                      setPesoInput("0.000");
                    }
                  }}
                  className="bg-transparent border-b-2 border-emerald-400/20 focus:border-emerald-400 text-5xl font-mono font-black text-emerald-400 tracking-wider text-center w-40 focus:outline-none drop-shadow-[0_0_8px_rgba(52,211,153,0.3)] py-1 rounded-xl"
                  placeholder="0.000"
                />
                <span className="text-2xl text-emerald-500 font-mono font-black">kg</span>
              </div>
              <div className="flex justify-center gap-6 text-[11px] font-mono text-slate-400 border-t border-slate-800/60 pt-2 mt-2">
                <div>Bruto: {(Number(pesoInput) || 0).toFixed(3)} kg</div>
                <div>Tara: {tara.toFixed(3)} kg</div>
              </div>
            </div>

            {/* Weigh controls */}
            <div className="mt-5 space-y-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Simulación de Balanza</p>
              
              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => ajustarPeso(0.1)}
                  className="bg-slate-800 hover:bg-slate-700 border border-slate-700/50 rounded-xl py-2 text-xs font-bold font-mono transition-all"
                >
                  +100g
                </button>
                <button
                  type="button"
                  onClick={() => ajustarPeso(0.5)}
                  className="bg-slate-800 hover:bg-slate-700 border border-slate-700/50 rounded-xl py-2 text-xs font-bold font-mono transition-all"
                >
                  +500g
                </button>
                <button
                  type="button"
                  onClick={() => ajustarPeso(1.0)}
                  className="bg-slate-800 hover:bg-slate-700 border border-slate-700/50 rounded-xl py-2 text-xs font-bold font-mono transition-all"
                >
                  +1.0k
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const actual = Number(pesoInput) || 0;
                    setTara(actual);
                  }}
                  className="bg-slate-800 hover:bg-slate-700 border border-slate-700/50 text-yellow-400 rounded-xl py-2 text-xs font-bold transition-all"
                >
                  TARA
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={simularPesoRandom}
                  className="bg-slate-800 hover:bg-slate-700 border border-slate-700/50 text-blue-400 rounded-xl py-2 text-xs font-bold transition-all"
                >
                  🎲 Peso Aleatorio
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPesoInput("0.000");
                    setTara(0.0);
                  }}
                  className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl py-2 text-xs font-bold transition-all"
                >
                  Limpiar Balanza
                </button>
              </div>
            </div>

            {/* Live calculation if product is selected */}
            {productoSel && (
              <div className="mt-5 p-4 rounded-2xl bg-black/30 border border-slate-800 space-y-2.5 animate-fade-in text-slate-300">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-medium">Producto Seleccionado:</span>
                  <span className="font-bold text-white">{productoSel.nombre}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-medium">Precio por Kg:</span>
                  <span className="font-mono font-semibold text-white">${fmt(productoSel.precio_1_detalle)}</span>
                </div>
                <div className="flex justify-between items-center text-xs border-t border-slate-800/80 pt-2">
                  <span className="text-slate-400 font-medium">Total en Dólares:</span>
                  <span className="font-mono text-base font-bold text-emerald-400">${fmt(totalUsd)}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-medium">Total en Bolívares:</span>
                  <span className="font-mono text-sm text-slate-100">Bs. {fmt(totalVes)}</span>
                </div>

                <button
                  type="button"
                  onClick={guardarPesaje}
                  disabled={guardandoPesaje || !cliente || pesoNeto <= 0}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl py-3 text-sm tracking-wide transition-all shadow-md hover:shadow-emerald-600/10 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                >
                  {guardandoPesaje ? "Procesando Pesaje..." : "📥 Guardar y Registrar Pesaje"}
                </button>
              </div>
            )}
          </section>

        </div>

        {/* RIGHT COLUMN: DEPARTMENT SELECTOR & CATALOG / HISTORY GRID */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* DEPARTMENT TABS / SELECTOR */}
          <section className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-slate-900">🏢 Selección de Departamento</h3>
              <div className="flex items-center gap-2">
                {disabledDeptSelector && (
                  <span className="bg-amber-50 text-amber-800 border border-amber-200 text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1.5">
                    🔒 Perfil Bloqueado a Estación
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setMostrarHistorialBalanza((v) => !v)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5"
                >
                  🧾 {mostrarHistorialBalanza ? "Ocultar historial" : "Historial de desposte"}
                </button>
                <button
                  type="button"
                  onClick={() => { setSolicitudEnEjecucion(null); setMostrarDesposte(true); }}
                  className="bg-violet-50 hover:bg-violet-600 text-violet-700 hover:text-white border border-violet-100 hover:border-violet-600 text-xs font-bold px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5"
                >
                  🥩 Desposte
                </button>
              </div>
            </div>

            {/* Cola de pendientes: siempre visible (sin toggle) para que nunca "desaparezca" de Balanza */}
            <div className="bg-amber-50/60 border border-amber-100 rounded-2xl p-3 space-y-2">
              <p className="text-[10px] font-black uppercase text-amber-700 tracking-wider px-0.5">
                🔔 Solicitudes de Desposte Pendientes — {DEPARTAMENTOS.find((d) => d.key === deptActivo)?.label ?? deptActivo} ({solicitudesPendientes.length})
              </p>
              {solicitudesPendientes.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-3">Sin solicitudes pendientes para este departamento.</p>
              )}
              {solicitudesPendientes.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 bg-white rounded-xl border border-amber-100 px-3.5 py-2.5">
                  <div>
                    <p className="text-xs font-bold text-slate-800">{s.producto_origen_nombre} — {Number(s.cantidad_estimada).toFixed(3)} kg estimados</p>
                    <p className="text-[10px] text-slate-400">
                      Solicitado por {s.solicitado_por_nombre ?? "—"} el {new Date(s.created_at).toLocaleString("es-VE")}
                      {s.comentario_solicitud ? ` — "${s.comentario_solicitud}"` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setSolicitudEnEjecucion(s); setMostrarDesposte(true); }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-all whitespace-nowrap"
                  >
                    Ejecutar
                  </button>
                </div>
              ))}
            </div>

            {mostrarHistorialBalanza && (
              <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden animate-fade-in">
                <div className="p-3 bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase text-slate-500">
                  Historial — {DEPARTAMENTOS.find((d) => d.key === deptActivo)?.label ?? deptActivo}
                </div>
                <div className="divide-y divide-slate-50 max-h-72 overflow-y-auto">
                  {historialBalanza.length === 0 && <p className="text-xs text-slate-400 text-center py-6">Sin movimientos en el historial todavía.</p>}
                  {historialBalanza.map((s) => (
                    <div key={s.id} className="flex items-center justify-between px-4 py-2.5 text-xs">
                      <div>
                        <span className="font-bold text-slate-800">{s.producto_origen_nombre}</span>
                        <span className="text-slate-400"> · {new Date(s.created_at).toLocaleDateString("es-VE")}</span>
                        {s.estatus !== "cancelado" && (
                          <p className="text-[10px] text-slate-400">
                            Ejecutado por {s.ejecutado_por_nombre ?? "—"}
                            {s.estatus === "verificado" ? ` · verificado por ${s.verificado_por_nombre ?? "Caja"}` : ""}
                          </p>
                        )}
                        {s.estatus === "cancelado" && s.cancelado_motivo && <p className="text-[10px] text-slate-400">Motivo: {s.cancelado_motivo}</p>}
                      </div>
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase whitespace-nowrap ${
                        s.estatus === "verificado" ? "bg-emerald-100 text-emerald-700" : s.estatus === "completado" ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-600"
                      }`}>
                        {s.estatus}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {DEPARTAMENTOS.map((dept) => {
                const active = deptActivo === dept.key;
                const matchesRoleForDept = userRol ? (userRol === dept.roleRequired || ["propietario", "admin"].includes(userRol)) : true;
                const disabled = !matchesRoleForDept;

                return (
                  <button
                    key={dept.key}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (!disabled) setDeptActivo(dept.key);
                    }}
                    className={`flex items-center justify-between p-4 rounded-2xl text-left border transition-all ${
                      active
                        ? "bg-slate-950 text-white border-slate-950 shadow-md"
                        : disabled
                        ? "bg-slate-50 text-slate-300 border-slate-200/50 cursor-not-allowed opacity-50"
                        : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                    }`}
                  >
                    <span className="font-bold text-sm">{dept.label}</span>
                    {active && <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full">Activo</span>}
                  </button>
                );
              })}
            </div>
          </section>

          {/* PEDIDOS PENDIENTES EN BALANZA: SIEMPRE VISIBLE, INDEPENDIENTE DEL CLIENTE IDENTIFICADO */}
          <section className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">🎟️ Pedidos Pendientes en Balanza</h3>
                <p className="text-xs text-slate-400 mt-0.5">Todos los clientes con pesajes sin cobrar · se cancelan desde Caja</p>
              </div>
              <span className="bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1 rounded-full">
                {pendientesPorCliente.length} cliente(s)
              </span>
            </div>

            {cargandoPendientes && pendientesPorCliente.length === 0 ? (
              <p className="text-xs text-slate-400 font-medium animate-pulse py-3">Cargando pedidos pendientes...</p>
            ) : pendientesPorCliente.length === 0 ? (
              <p className="text-xs text-slate-400 font-medium py-3">Ningún cliente tiene pesajes pendientes en este momento.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto pr-1">
                {pendientesPorCliente.map((p) => {
                  const esActivo = cliente?.id === p.cliente_id;
                  return (
                    <button
                      key={p.cliente_id}
                      type="button"
                      onClick={() => atenderCliente(p.cliente_id)}
                      className={`text-left p-3 rounded-2xl border transition-all ${
                        esActivo ? "bg-blue-50 border-blue-200" : "bg-slate-50 hover:bg-slate-100 border-slate-200"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-800 text-xs line-clamp-1">{p.cliente_nombre}</span>
                        {esActivo && <span className="text-[9px] font-bold bg-blue-600 text-white px-1.5 py-0.5 rounded-full shrink-0">Activo</span>}
                      </div>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[10px] text-slate-400 font-mono">{p.cantidad_tickets} ticket(s)</span>
                        <span className="font-mono font-bold text-blue-600 text-sm">${fmt(p.monto_total)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* DYNAMIC SHARING LAYOUT: CATALOG (2/3 width) AND PURCHASE HISTORY (1/3 width) */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            
            {/* PRODUCT LISTING CARD (2/3 width) */}
            <section className="xl:col-span-2 bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4 min-h-[400px] flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-50 pb-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">📦 Catálogo del Departamento</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Seleccione el producto pesado en la balanza</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1 rounded-full">
                    {productos.length} Productos
                  </span>
                  <button
                    type="button"
                    onClick={() => setMostrarAltaRapida(true)}
                    className="bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-100 hover:border-emerald-600 text-xs font-bold px-3 py-1 rounded-full transition-all"
                  >
                    + Agregar producto
                  </button>
                </div>
              </div>

              {errorText && <p className="text-sm font-semibold text-rose-600 bg-rose-50 p-3 rounded-2xl">{errorText}</p>}

              {loadingProds ? (
                <div className="flex-1 flex items-center justify-center">
                  <span className="text-slate-400 font-medium animate-pulse">Cargando productos de la estación...</span>
                </div>
              ) : productos.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <span className="text-4xl">📭</span>
                  <h4 className="font-bold text-slate-700 mt-3">No hay productos cargados</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm">
                    Debe agregar productos con la línea o departamento "{deptActivo}" en el módulo de Ingreso de Datos, o crear uno rápido aquí mismo.
                  </p>
                  <button
                    type="button"
                    onClick={() => setMostrarAltaRapida(true)}
                    className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all"
                  >
                    + Agregar producto a "{deptActivo}"
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {productos.map((prod) => {
                    const seleccionado = productoSel?.id === prod.id;
                    return (
                      <button
                        key={prod.id}
                        type="button"
                        onClick={() => setProductoSel(prod)}
                        className={`p-4 rounded-2xl text-left border transition-all flex flex-col justify-between h-32 ${
                          seleccionado
                            ? "bg-blue-600 text-white border-blue-600 shadow-md scale-[1.02]"
                            : "bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${seleccionado ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"}`}>
                              {prod.codigo_interno}
                            </span>
                            <span className="text-xs font-semibold">
                              Stock: {prod.stock_total !== undefined ? fmtKg(prod.stock_total) : "N/D"}
                            </span>
                          </div>
                          <h4 className="font-bold text-sm mt-2 line-clamp-1">{prod.nombre}</h4>
                        </div>
                        <div className="flex justify-between items-baseline mt-2">
                          <span className={`text-[10px] font-medium ${seleccionado ? "text-blue-100" : "text-slate-400"}`}>Precio / Kg</span>
                          <span className="font-mono text-base font-black">${fmt(prod.precio_1_detalle)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* DYNAMIC CLIENT PURCHASE HISTORY CARD (1/3 width) */}
            <section className="xl:col-span-1 bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col min-h-[400px] hover:shadow-md transition-all duration-300">
              <div className="border-b border-slate-50 pb-3">
                <h3 className="text-lg font-bold text-slate-900">📜 Historial Cliente</h3>
                <p className="text-xs text-slate-400 mt-0.5">Sugerencias y hábitos de consumo</p>
              </div>

              {!cliente ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200 mt-4">
                  <span className="text-3xl">👤</span>
                  <h4 className="font-bold text-slate-700 mt-2 text-sm">Sin Cliente</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-[160px]">
                    Busque un cliente en la sección izquierda para visualizar sus compras previas y sugerir ofertas.
                  </p>
                </div>
              ) : (
                <div className="flex-1 flex flex-col justify-between mt-4">
                  <div className="space-y-4">
                    
                    {/* VISITA ACTUAL (TICKETS PENDIENTES DE PAGO) */}
                    <div className="space-y-2">
                      <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider block">
                        🎟️ Visita Actual (Tickets en Balanza)
                      </span>

                      {cargandoPendientes ? (
                        <div className="flex items-center justify-center py-6">
                          <span className="text-slate-400 text-xs font-medium animate-pulse">Cargando pendientes...</span>
                        </div>
                      ) : ticketsAgrupados.length === 0 ? (
                        <div className="text-center py-5 bg-slate-50 border border-slate-100 rounded-2xl">
                          <p className="text-xs text-slate-400 font-medium">Ningún ticket pesado pendiente.</p>
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                          {ticketsAgrupados.map((grupo) => {
                            const prod = masterProductos.find(p => p.id === grupo.producto_id);
                            const name = prod ? prod.nombre : `Producto #${grupo.producto_id}`;
                            const linea = prod?.linea ?? "General";

                            // Badge style
                            const isCarn = linea.includes("Carnic");
                            const isVerd = linea.includes("Verdul");
                            const isChar = linea.includes("Charcut");
                            const badgeColor = isCarn ? "bg-rose-50 text-rose-600 border-rose-100"
                                             : isVerd ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                                             : isChar ? "bg-amber-50 text-amber-600 border-amber-100"
                                             : "bg-slate-100 text-slate-600 border-slate-200";

                            const timeStr = new Date(grupo.created_at).toLocaleTimeString("es-VE", {
                              hour: "2-digit",
                              minute: "2-digit"
                            });

                            const precioKg = prod ? Number(prod.precio_1_detalle) : 0;

                            return (
                              <div key={grupo.producto_id} className="bg-blue-50/20 border border-blue-100/50 rounded-2xl p-3 text-xs hover:bg-blue-50/40 transition-all space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-bold text-slate-800 block line-clamp-1">{name}</span>
                                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${badgeColor}`}>
                                        {linea}
                                      </span>
                                      {grupo.ids.length > 1 && (
                                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                                          x{grupo.ids.length} pesajes
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-mono mt-1">
                                      {timeStr} · @ ${fmt(precioKg)}/Kg
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => cancelarGrupoPendiente(grupo.ids)}
                                    title="Anular pesaje (ej. el cliente devolvió el producto)"
                                    className="text-rose-500 hover:bg-rose-50 hover:text-rose-600 rounded-lg p-1.5 transition-all shrink-0"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                </div>

                                <div className="flex items-center justify-between gap-2 pt-2 border-t border-blue-100/50">
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      title="Quitar 100g (ej. corregir o devolución parcial)"
                                      onClick={() => actualizarPesoGrupo(grupo, Math.max(0, grupo.peso - 0.1))}
                                      className="h-6 w-6 flex items-center justify-center rounded-lg bg-white border border-blue-200 text-blue-600 hover:bg-blue-100 font-bold transition-all"
                                    >
                                      −
                                    </button>
                                    <span className="font-mono font-bold text-slate-700 px-1 min-w-[64px] text-center">
                                      {fmtKg(grupo.peso)} kg
                                    </span>
                                    <button
                                      type="button"
                                      title="Agregar 100g más al pesaje"
                                      onClick={() => actualizarPesoGrupo(grupo, grupo.peso + 0.1)}
                                      className="h-6 w-6 flex items-center justify-center rounded-lg bg-white border border-blue-200 text-blue-600 hover:bg-blue-100 font-bold transition-all"
                                    >
                                      +
                                    </button>
                                  </div>
                                  <span className="font-mono font-bold text-blue-600">${fmt(grupo.monto_usd)}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* CRM HISTORICAL PURCHASES */}
                    <div className="space-y-2 border-t border-slate-100 pt-4">
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider">
                          📜 Historial (Últimas Compras)
                        </span>
                      {historialCompras.length > limiteHistorial && (
                        <button
                          type="button"
                          onClick={() => setLimiteHistorial(prev => prev + 5)}
                          className="text-[11px] text-blue-600 hover:text-blue-700 font-bold transition-all animate-pulse"
                        >
                          Ver más +
                        </button>
                      )}
                    </div>

                    {cargandoHistorial ? (
                      <div className="flex items-center justify-center py-12">
                        <span className="text-slate-400 text-xs font-medium animate-pulse">Cargando compras...</span>
                      </div>
                    ) : historialCompras.length === 0 ? (
                      <div className="text-center py-12 bg-slate-50 rounded-xl">
                        <p className="text-xs text-slate-400">Sin historial registrado.</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                        {historialCompras.slice(0, limiteHistorial).map((ticket) => {
                          const prod = masterProductos.find(p => p.id === ticket.producto_id);
                          const name = prod ? prod.nombre : `Producto #${ticket.producto_id}`;
                          const linea = prod?.linea ?? "General";
                          
                          // Badge style
                          const isCarn = linea.includes("Carnic");
                          const isVerd = linea.includes("Verdul");
                          const isChar = linea.includes("Charcut");
                          const badgeColor = isCarn ? "bg-rose-50 text-rose-600 border-rose-100"
                                           : isVerd ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                                           : isChar ? "bg-amber-50 text-amber-600 border-amber-100"
                                           : "bg-slate-100 text-slate-600 border-slate-200";

                          const dateStr = new Date(ticket.created_at).toLocaleDateString("es-VE", {
                            day: "numeric",
                            month: "short"
                          });

                          return (
                            <div key={ticket.id} className="bg-slate-50 border border-slate-100/80 rounded-2xl p-3 flex justify-between items-center text-xs hover:bg-slate-100/30 transition-all">
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-slate-850 block line-clamp-1">{name}</span>
                                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${badgeColor}`}>
                                    {linea}
                                  </span>
                                </div>
                                <p className="text-[10px] text-slate-400 font-mono mt-1">
                                  {dateStr} · {fmtKg(Number(ticket.peso))} kg @ ${fmt(prod ? Number(prod.precio_1_detalle) : 0)}/Kg
                                </p>
                              </div>
                              <div className="text-right flex flex-col items-end gap-1">
                                <span className="font-mono font-bold text-slate-700">${fmt(Number(ticket.monto_usd))}</span>
                                <button
                                  type="button"
                                  onClick={() => openSurveyModal(ticket, name)}
                                  className="text-[10px] bg-blue-50 hover:bg-blue-100 text-blue-600 px-2.5 py-1 rounded-lg font-bold transition-all"
                                >
                                  💬 Encuesta
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    </div> {/* Closes the <div className="space-y-2 border-t border-slate-100 pt-4"> CRM section */}
                  </div> {/* Closes the <div className="space-y-4"> Visita+CRM container */}
                  
                  {/* Suggestions for Marketing */}
                  <div className="mt-4 p-3 bg-blue-50/50 border border-blue-100/60 rounded-2xl text-[11px] text-blue-700">
                    <span className="font-bold uppercase tracking-wider block mb-1 text-[9px] text-blue-500">💡 Sugerencia al Vendedor:</span>
                    Consulte el historial para recomendar cortes o productos específicos en promoción.
                  </div>
                </div>
              )}
            </section>

          </div>

        </div>

      </div>

      {/* DESPOSTE OVERLAY DIALOG */}
      {mostrarDesposte && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in overflow-y-auto">
          <div className="w-full max-w-6xl bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 relative my-8">
            <button
              type="button"
              onClick={() => { setMostrarDesposte(false); setSolicitudEnEjecucion(null); }}
              className="absolute top-4 right-4 z-10 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full w-8 h-8 flex items-center justify-center font-bold transition-all"
              title="Cerrar"
            >
              ✕
            </button>
            <ModuloDesposte
              solicitudId={solicitudEnEjecucion?.id}
              productoOrigenIdPrellenado={solicitudEnEjecucion?.producto_origen_id}
              cantidadEstimadaPrellenada={solicitudEnEjecucion ? Number(solicitudEnEjecucion.cantidad_estimada) : undefined}
              onEjecutado={() => {
                setMostrarDesposte(false);
                setSolicitudEnEjecucion(null);
                cargarSolicitudesPendientes();
                if (mostrarHistorialBalanza) cargarHistorialBalanza();
              }}
            />
          </div>
        </div>
      )}

      {/* ALTA RÁPIDA DE PRODUCTO DESDE BALANZA */}
      {mostrarAltaRapida && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 relative">
            <button
              type="button"
              onClick={() => setMostrarAltaRapida(false)}
              className="absolute top-4 right-4 z-10 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full w-8 h-8 flex items-center justify-center font-bold transition-all"
              title="Cerrar"
            >
              ✕
            </button>
            <h3 className="text-lg font-bold text-slate-900">+ Agregar producto</h3>
            <p className="text-xs text-slate-400 mt-0.5 mb-4">
              Se creará con línea "<span className="font-bold">{deptActivo}</span>" y tipo de venta "peso" — aparecerá de inmediato en este catálogo.
            </p>
            <div className="space-y-3">
              <label className="flex flex-col">
                <span className={labelClsAlta}>Nombre</span>
                <input
                  className={inputClsAlta}
                  value={altaRapidaForm.nombre}
                  onChange={(e) => setAltaRapidaForm((p) => ({ ...p, nombre: e.target.value }))}
                  placeholder="Ej: Pollo Entero"
                />
              </label>
              <label className="flex flex-col">
                <span className={labelClsAlta}>Código interno</span>
                <input
                  className={inputClsAlta}
                  value={altaRapidaForm.codigo_interno}
                  onChange={(e) => setAltaRapidaForm((p) => ({ ...p, codigo_interno: e.target.value }))}
                  placeholder="Ej: C003"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col">
                  <span className={labelClsAlta}>Costo USD/Kg</span>
                  <input type="number" step="0.01" className={inputClsAlta} value={altaRapidaForm.costo_usd} onChange={(e) => setAltaRapidaForm((p) => ({ ...p, costo_usd: e.target.value }))} placeholder="0.00" />
                </label>
                <label className="flex flex-col">
                  <span className={labelClsAlta}>Precio 1 USD/Kg</span>
                  <input type="number" step="0.01" className={inputClsAlta} value={altaRapidaForm.precio_1_detalle} onChange={(e) => setAltaRapidaForm((p) => ({ ...p, precio_1_detalle: e.target.value }))} placeholder="0.00" />
                </label>
              </div>
              <label className="flex flex-col">
                <span className={labelClsAlta}>Peso de referencia (Kg, opcional)</span>
                <input type="number" step="0.001" className={inputClsAlta} value={altaRapidaForm.peso} onChange={(e) => setAltaRapidaForm((p) => ({ ...p, peso: e.target.value }))} placeholder="0.000" />
              </label>

              {altaRapidaError && <p className="text-xs font-semibold text-rose-600 bg-rose-50 p-2.5 rounded-xl">{altaRapidaError}</p>}

              <button
                type="button"
                disabled={guardandoAltaRapida}
                onClick={crearProductoRapido}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm py-2.5 rounded-xl transition-all"
              >
                {guardandoAltaRapida ? "Guardando..." : "Crear producto"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINTED TICKET OVERLAY DIALOG */}
      {printedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 relative overflow-hidden animate-slide-up">
            
            {/* Success ribbon */}
            <div className="bg-emerald-600 text-white text-[10px] font-bold py-1 text-center absolute top-0 left-0 right-0 tracking-widest uppercase">
              Pesaje Registrado Exitosamente
            </div>

            {/* Sticker layout */}
            <div className="border border-slate-200 rounded-2xl p-4 mt-4 bg-slate-50 border-dashed space-y-4">
              <div className="text-center">
                <h4 className="font-black text-slate-800 text-base">MINIMARKET EL VAIVÉN</h4>
                <p className="text-[9px] text-slate-400 tracking-wider">BALANZA DIGITAL · DEPT: {printedTicket.departamento.toUpperCase()}</p>
              </div>

              {/* Barcode visual */}
              <div className="flex flex-col items-center py-2 bg-white rounded-xl border border-slate-100">
                <div className="flex justify-center gap-0.5 h-10 w-44 items-stretch">
                  {[...Array(24)].map((_, idx) => {
                    const width = (idx % 3 === 0) ? "w-1" : (idx % 4 === 0) ? "w-1.5" : "w-[2px]";
                    const color = idx === 11 || idx === 12 ? "bg-slate-200" : "bg-slate-900";
                    return <div key={idx} className={`${width} ${color}`}></div>;
                  })}
                </div>
                <p className="text-[10px] font-mono mt-1.5 text-slate-700 tracking-widest">
                  *TKT-{printedTicket.id.toString().padStart(6, "0")}*
                </p>
              </div>

              {/* Data list */}
              <div className="text-xs space-y-1.5 font-medium text-slate-600 border-t border-slate-200/60 pt-3">
                <div className="flex justify-between">
                  <span>Cliente:</span>
                  <span className="text-slate-800 font-bold">{printedTicket.cliente.nombre}</span>
                </div>
                <div className="flex justify-between">
                  <span>Cédula:</span>
                  <span className="text-slate-800 font-mono">{printedTicket.cliente.cedula}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200/40 pt-1.5">
                  <span>Producto:</span>
                  <span className="text-slate-800 font-bold">{printedTicket.producto.nombre}</span>
                </div>
                <div className="flex justify-between">
                  <span>Precio / Kg:</span>
                  <span className="text-slate-800 font-mono">${fmt(printedTicket.producto.precio_1_detalle)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Peso Registrado:</span>
                  <span className="text-slate-900 font-mono font-bold text-sm">{fmtKg(printedTicket.peso)} kg</span>
                </div>
                <div className="flex justify-between border-t border-slate-200/40 pt-1.5 text-slate-800">
                  <span className="font-bold">Total a Pagar USD:</span>
                  <span className="font-mono font-black text-emerald-600">${fmt(printedTicket.montoUsd)}</span>
                </div>
                <div className="flex justify-between text-slate-500 text-[10px]">
                  <span>Total en Bolívares:</span>
                  <span className="font-mono">Bs. {fmt(printedTicket.montoVes)}</span>
                </div>
              </div>

              <div className="text-[9px] text-center text-slate-400 font-semibold border-t border-slate-200/60 pt-2.5">
                HORA: {printedTicket.fecha} · POR: {userRol ? userRol.toUpperCase() : "AGENTE"}
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setPrintedTicket(null)}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-2xl py-3 text-sm font-bold transition-all shadow-md"
              >
                ✓ Entendido / Cerrar Ticket
              </button>
            </div>

          </div>
        </div>
      )}

      {/* QUALITY SURVEY DIALOG */}
      {surveyTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 relative overflow-hidden animate-slide-up">
            
            <div className="bg-blue-600 text-white text-[10px] font-bold py-1.5 text-center absolute top-0 left-0 right-0 tracking-widest uppercase">
              Encuesta de Calidad de Producto
            </div>

            <div className="space-y-4 mt-6">
              <div>
                <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Producto a Evaluar</h4>
                <p className="font-bold text-slate-800 text-lg mt-0.5">{surveyProductName}</p>
                <p className="text-xs text-slate-500 font-mono">
                  Comprado el: {new Date(surveyTicket.created_at).toLocaleDateString("es-VE")} · Peso: {fmtKg(Number(surveyTicket.peso))} kg
                </p>
              </div>

              {surveySuccessMessage ? (
                <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 p-4 rounded-2xl text-center font-bold text-sm animate-pulse">
                  🎉 {surveySuccessMessage}
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">¿Qué tal estuvo el producto?</label>
                    <div className="grid grid-cols-2 gap-2">
                      {["Excelente", "Normal", "Estaba dura / mala", "Ya no me gusta", "Otro"].map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setSurveyOption(opt)}
                          className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-center ${
                            surveyOption === opt
                              ? "bg-slate-950 text-white border-slate-950 shadow-md"
                              : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Observaciones / Detalles</label>
                    <textarea
                      value={surveyComment}
                      onChange={(e) => setSurveyComment(e.target.value)}
                      placeholder={
                        surveyOption === "Otro"
                          ? "Describa detalladamente el problema o comentario del cliente..."
                          : "Comentarios adicionales (opcional)..."
                      }
                      rows={3}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {surveyError && (
                    <p className="text-xs font-semibold text-rose-600 bg-rose-50 p-2.5 rounded-xl">{surveyError}</p>
                  )}

                  <div className="flex gap-2 border-t border-slate-100 pt-4 mt-2">
                    <button
                      type="button"
                      onClick={() => setSurveyTicket(null)}
                      disabled={guardandoSurvey}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl py-2.5 text-xs font-bold transition-all disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={guardarEncuestaCalidad}
                      disabled={guardandoSurvey}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2.5 text-xs font-bold transition-all disabled:opacity-50"
                    >
                      {guardandoSurvey ? "Guardando..." : "Guardar Encuesta"}
                    </button>
                  </div>
                </>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
