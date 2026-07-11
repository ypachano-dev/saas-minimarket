import { useState, useEffect } from "react";
import apiClient from "../api/client";

interface FacturaItem {
  id: number;
  producto_id: number;
  producto_nombre?: string;
  cantidad: number;
  precio_unitario_usd: number;
  aplica_iva: boolean;
  iva_porcentaje: number;
  subtotal_usd: number;
}

interface Factura {
  id: number;
  nro_factura: string;
  nro_control: string;
  cliente_nombre: string;
  cliente_rif: string;
  cliente_direccion: string | null;
  tasa_bcv: number;
  monto_exento_usd: number;
  monto_imponible_usd: number;
  monto_iva_usd: number;
  total_usd: number;
  total_ves: number;
  presupuesto_id: number | null;
  created_at: string;
  items: FacturaItem[];
}

interface Cliente {
  id: number;
  nombre: string;
  cedula: string;
  direccion: string | null;
}

interface Producto {
  id: number;
  nombre: string;
  codigo_interno: string;
  precio_1_detalle: number;
  aplica_iva: boolean;
}

interface PresupuestoDisponible {
  id: number;
  cliente_id: number;
  cliente_nombre: string;
  cliente_rif: string;
  total_usd: number;
  created_at: string;
  items: {
    producto_id: number;
    producto_nombre: string;
    cantidad: number;
    precio_unitario: number;
    monto_usd: number;
  }[];
}

interface TicketDisponible {
  id: number;
  cliente_id: number;
  cliente_nombre: string;
  cliente_rif: string;
  producto_id: number;
  producto_nombre: string;
  peso: number;
  monto_usd: number;
  created_at: string;
}

export default function ModuloFacturacion() {
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [viewingFactura, setViewingFactura] = useState<Factura | null>(null);
  
  // Emisión states
  const [showEmision, setShowEmision] = useState(false);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [presupuestos, setPresupuestos] = useState<PresupuestoDisponible[]>([]);
  const [tickets, setTickets] = useState<TicketDisponible[]>([]);
  const [ticketsPendientesTodos, setTicketsPendientesTodos] = useState<TicketDisponible[]>([]);
  
  const [clienteSelected, setClienteSelected] = useState<number | "">("");
  const [tipoFacturacion, setTipoFacturacion] = useState<"directa" | "presupuesto" | "tickets_caja">("directa");
  
  const [presupuestoIdSelected, setPresupuestoIdSelected] = useState<number | "">("");
  const [ticketsSelectedIds, setTicketsSelectedIds] = useState<number[]>([]);
  
  // Direct billing items
  const [itemsDirectos, setItemsDirectos] = useState<{
    producto_id: number;
    cantidad: number;
    precio_unitario_usd: number;
    aplica_iva: boolean;
  }[]>([]);

  const [tasaBcv, setTasaBcv] = useState(36.50);
  const [cargando, setCargando] = useState(false);
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);

  useEffect(() => {
    cargarFacturas();
    cargarClientes();
    cargarProductos();
    cargarTasa();
    cargarPresupuestosDisponibles();
    cargarTicketsPendientesTodos();
  }, []);

  useEffect(() => {
    if (showEmision) {
      cargarPresupuestosDisponibles();
      if (clienteSelected) {
        cargarTicketsDisponibles(Number(clienteSelected));
      } else {
        setTickets([]);
      }
    }
  }, [showEmision, clienteSelected]);

  const cargarFacturas = async () => {
    try {
      const { data } = await apiClient.get<Factura[]>("/api/v1/facturas");
      setFacturas(data);
    } catch (err) {
      console.error("Error cargando facturas", err);
    }
  };

  const cargarClientes = async () => {
    try {
      const { data } = await apiClient.get<Cliente[]>("/api/v1/clientes");
      setClientes(data);
    } catch (err) {
      console.error("Error cargando clientes", err);
    }
  };

  const cargarProductos = async () => {
    try {
      const { data } = await apiClient.get<Producto[]>("/api/v1/productos");
      setProductos(data);
    } catch (err) {
      console.error("Error cargando productos", err);
    }
  };

  const cargarTasa = async () => {
    try {
      const { data } = await apiClient.get("/api/v1/tasa");
      if (data && data.valor_bcv) {
        setTasaBcv(Number(data.valor_bcv));
      }
    } catch (err) {
      console.error("Error cargando tasa", err);
    }
  };

  const cargarPresupuestosDisponibles = async () => {
    try {
      const { data } = await apiClient.get<PresupuestoDisponible[]>("/api/v1/facturas-presupuestos-disponibles");
      setPresupuestos(data);
    } catch (err) {
      console.error("Error cargando presupuestos", err);
    }
  };

  const cargarTicketsDisponibles = async (cId: number) => {
    try {
      const { data } = await apiClient.get<TicketDisponible[]>(`/api/v1/facturas-tickets-disponibles?cliente_id=${cId}`);
      setTickets(data);
    } catch (err) {
      console.error("Error cargando tickets", err);
    }
  };

  const cargarTicketsPendientesTodos = async () => {
    try {
      const { data } = await apiClient.get<TicketDisponible[]>("/api/v1/facturas-tickets-disponibles");
      setTicketsPendientesTodos(data);
    } catch (err) {
      console.error("Error cargando tickets pendientes", err);
    }
  };

  const iniciarFacturacionDesdePresupuesto = (p: PresupuestoDisponible) => {
    setTipoFacturacion("presupuesto");
    setPresupuestoIdSelected(p.id);
    setClienteSelected(p.cliente_id);
    setMensajeExito(null);
    setMensajeError(null);
    setShowEmision(true);
  };

  const iniciarFacturacionDesdeTickets = (clienteId: number) => {
    setTipoFacturacion("tickets_caja");
    setClienteSelected(clienteId);
    setTicketsSelectedIds([]);
    setMensajeExito(null);
    setMensajeError(null);
    setShowEmision(true);
  };

  const handleTipoFacturacionChange = (tipo: "directa" | "presupuesto" | "tickets_caja") => {
    setTipoFacturacion(tipo);
    setPresupuestoIdSelected("");
    setTicketsSelectedIds([]);
    setItemsDirectos([]);
  };

  const handlePresupuestoChange = (pIdVal: number | "") => {
    setPresupuestoIdSelected(pIdVal);
    if (!pIdVal) return;
    const pres = presupuestos.find(p => p.id === pIdVal);
    if (pres) {
      setClienteSelected(pres.cliente_id);
    }
  };

  const handleTicketCheckboxChange = (tId: number, checked: boolean) => {
    if (checked) {
      setTicketsSelectedIds(prev => [...prev, tId]);
    } else {
      setTicketsSelectedIds(prev => prev.filter(id => id !== tId));
    }
  };

  const agregarItemDirecto = () => {
    setItemsDirectos(prev => [...prev, { producto_id: 0, cantidad: 1, precio_unitario_usd: 0, aplica_iva: true }]);
  };

  const removerItemDirecto = (index: number) => {
    setItemsDirectos(prev => prev.filter((_, i) => i !== index));
  };

  const actualizarItemDirecto = (index: number, campo: string, valor: any) => {
    setItemsDirectos(prev => prev.map((item, i) => {
      if (i === index) {
        let updated = { ...item, [campo]: valor };
        if (campo === "producto_id" && valor > 0) {
          const prod = productos.find(p => p.id === Number(valor));
          if (prod) {
            updated.precio_unitario_usd = prod.precio_1_detalle;
            updated.aplica_iva = prod.aplica_iva;
          }
        }
        return updated;
      }
      return item;
    }));
  };

  const emitirFactura = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensajeError(null);
    setMensajeExito(null);
    setCargando(true);

    if (!clienteSelected) {
      setMensajeError("Debe seleccionar un cliente.");
      setCargando(false);
      return;
    }

    const payload: any = {
      cliente_id: Number(clienteSelected),
      items: []
    };

    if (tipoFacturacion === "presupuesto") {
      if (!presupuestoIdSelected) {
        setMensajeError("Debe seleccionar un presupuesto.");
        setCargando(false);
        return;
      }
      payload.presupuesto_id = Number(presupuestoIdSelected);
    } else if (tipoFacturacion === "tickets_caja") {
      if (ticketsSelectedIds.length === 0) {
        setMensajeError("Debe seleccionar al menos un ticket de Caja.");
        setCargando(false);
        return;
      }
      payload.ticket_ids = ticketsSelectedIds;
    } else {
      // Directa
      if (itemsDirectos.length === 0) {
        setMensajeError("Debe agregar al menos un ítem a la factura.");
        setCargando(false);
        return;
      }
      const invalid = itemsDirectos.some(it => it.producto_id === 0 || it.cantidad <= 0 || it.precio_unitario_usd <= 0);
      if (invalid) {
        setMensajeError("Complete todos los campos de los ítems con valores válidos.");
        setCargando(false);
        return;
      }
      payload.items = itemsDirectos.map(it => ({
        producto_id: Number(it.producto_id),
        cantidad: Number(it.cantidad),
        precio_unitario_usd: Number(it.precio_unitario_usd),
        aplica_iva: Boolean(it.aplica_iva)
      }));
    }

    try {
      const { data } = await apiClient.post<Factura>("/api/v1/facturas", payload);
      setMensajeExito(`Factura N° ${data.nro_factura} emitida con éxito.`);
      setViewingFactura(data);
      setShowEmision(false);
      setClienteSelected("");
      setPresupuestoIdSelected("");
      setTicketsSelectedIds([]);
      setItemsDirectos([]);
      cargarFacturas();
    } catch (err: any) {
      console.error(err);
      setMensajeError(err.response?.data?.detail || "Ocurrió un error al emitir la factura fiscal.");
    } finally {
      setCargando(false);
    }
  };

  const calcularTotalesDirectos = () => {
    let exento = 0;
    let imponible = 0;
    let iva = 0;
    itemsDirectos.forEach(it => {
      const sub = it.cantidad * it.precio_unitario_usd;
      if (it.aplica_iva) {
        imponible += sub;
        iva += sub * 0.16;
      } else {
        exento += sub;
      }
    });
    const total = exento + imponible + iva;
    return { exento, imponible, iva, total };
  };

  const facturasFiltradas = facturas.filter(f =>
    f.nro_factura.includes(busqueda) ||
    f.cliente_nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    f.cliente_rif.includes(busqueda)
  );

  const ticketsPorCliente = ticketsPendientesTodos.reduce((acc, t) => {
    if (!acc[t.cliente_id]) {
      acc[t.cliente_id] = { cliente_id: t.cliente_id, cliente_nombre: t.cliente_nombre, cliente_rif: t.cliente_rif, cantidad: 0, total_usd: 0 };
    }
    acc[t.cliente_id].cantidad += 1;
    acc[t.cliente_id].total_usd += Number(t.monto_usd);
    return acc;
  }, {} as Record<number, { cliente_id: number; cliente_nombre: string; cliente_rif: string; cantidad: number; total_usd: number }>);
  const gruposTicketsPendientes = Object.values(ticketsPorCliente);

  const hayPendientes = presupuestos.length > 0 || gruposTicketsPendientes.length > 0;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Facturación</h2>
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mt-1">
            Emisión de Facturas y Control Correlativo Fiscal
          </p>
        </div>
        <button
          onClick={() => {
            setShowEmision(true);
            setMensajeExito(null);
            setMensajeError(null);
          }}
          className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-5 py-3 transition-all flex items-center gap-2 shadow-lg shadow-slate-900/10 cursor-pointer self-start md:self-auto"
        >
          <span>➕</span> Emitir Nueva Factura
        </button>
      </div>

      {mensajeExito && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-between">
          <span>{mensajeExito}</span>
          <button onClick={() => setMensajeExito(null)} className="text-emerald-500 hover:text-emerald-700">✕</button>
        </div>
      )}

      {/* Pendientes por Facturar: presupuestos y tickets de Caja/POS listos para convertirse en factura */}
      {hayPendientes && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Presupuestos pendientes */}
          {presupuestos.length > 0 && (
            <div className="bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden">
              <div className="p-4 border-b border-slate-100 bg-amber-50/60">
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">🗺️ Presupuestos pendientes por facturar</h3>
                <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Cotizaciones listas para convertirse en factura fiscal</p>
              </div>
              <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {presupuestos.map(p => (
                  <div key={p.id} className="flex items-center justify-between gap-3 p-3.5 hover:bg-slate-50/60">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{p.cliente_nombre}</p>
                      <p className="text-[10px] text-slate-400 font-semibold">{p.cliente_rif} · {new Date(p.created_at).toLocaleDateString()} · ${Number(p.total_usd).toFixed(2)}</p>
                    </div>
                    <button
                      onClick={() => iniciarFacturacionDesdePresupuesto(p)}
                      className="shrink-0 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-bold px-3.5 py-2 transition-all cursor-pointer"
                    >
                      Facturar →
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tickets de Caja/POS pendientes, agrupados por cliente */}
          {gruposTicketsPendientes.length > 0 && (
            <div className="bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden">
              <div className="p-4 border-b border-slate-100 bg-sky-50/60">
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">🛒 Tickets de Caja/POS pendientes por facturar</h3>
                <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Ventas procesadas en Caja aún sin formalizar en factura</p>
              </div>
              <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {gruposTicketsPendientes.map(g => (
                  <div key={g.cliente_id} className="flex items-center justify-between gap-3 p-3.5 hover:bg-slate-50/60">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{g.cliente_nombre}</p>
                      <p className="text-[10px] text-slate-400 font-semibold">{g.cliente_rif} · {g.cantidad} ticket{g.cantidad !== 1 ? "s" : ""} · ${g.total_usd.toFixed(2)}</p>
                    </div>
                    <button
                      onClick={() => iniciarFacturacionDesdeTickets(g.cliente_id)}
                      className="shrink-0 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-bold px-3.5 py-2 transition-all cursor-pointer"
                    >
                      Facturar →
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Container */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden">
        {/* Search Header */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row items-center gap-3">
          <span className="text-slate-400 text-sm">🔍</span>
          <input
            type="text"
            placeholder="Buscar por nro de factura, cliente o RIF/Cédula..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full text-xs font-medium text-slate-700 placeholder-slate-400 focus:outline-none bg-transparent"
          />
        </div>

        {/* Table list */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <th className="px-5 py-3.5">N° Factura</th>
                <th className="px-5 py-3.5">N° Control</th>
                <th className="px-5 py-3.5">Cliente</th>
                <th className="px-5 py-3.5">Cédula / RIF</th>
                <th className="px-5 py-3.5 text-right">Total (USD)</th>
                <th className="px-5 py-3.5 text-right">Total (VES)</th>
                <th className="px-5 py-3.5">Fecha</th>
                <th className="px-5 py-3.5 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {facturasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-slate-400 font-medium">
                    No se encontraron facturas registradas.
                  </td>
                </tr>
              ) : (
                facturasFiltradas.map(f => (
                  <tr key={f.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-4 font-bold text-slate-900">N° {f.nro_factura}</td>
                    <td className="px-5 py-4 font-semibold text-slate-500">{f.nro_control}</td>
                    <td className="px-5 py-4 font-semibold text-slate-700">{f.cliente_nombre}</td>
                    <td className="px-5 py-4 font-mono font-bold text-slate-500">{f.cliente_rif}</td>
                    <td className="px-5 py-4 text-right font-black text-slate-900">${Number(f.total_usd).toFixed(2)}</td>
                    <td className="px-5 py-4 text-right font-bold text-brand-primary">{Number(f.total_ves).toFixed(2)} Bs</td>
                    <td className="px-5 py-4 text-slate-400 font-semibold">{new Date(f.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-4 text-center">
                      <button
                        onClick={() => setViewingFactura(f)}
                        className="rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold px-3.5 py-1.5 transition-all cursor-pointer"
                      >
                        📄 Ver Factura
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL EMISIÓN */}
      {showEmision && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-3xl rounded-3xl border border-slate-100 shadow-2xl overflow-hidden my-8 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-md font-black text-slate-900">Emisión de Factura Fiscal</h3>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">Regulación de Facturación</p>
              </div>
              <button onClick={() => setShowEmision(false)} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
            </div>

            {/* Error alerts inside modal */}
            {mensajeError && (
              <div className="p-3 mx-5 mt-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-[11px] font-bold text-center">
                {mensajeError}
              </div>
            )}

            {/* Form */}
            <form onSubmit={emitirFactura} className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Selector de Origen de Facturación */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleTipoFacturacionChange("directa")}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    tipoFacturacion === "directa" 
                      ? "bg-slate-900 border-slate-900 text-white font-bold" 
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold"
                  } text-[10px] uppercase tracking-wider`}
                >
                  📥 Facturación Directa
                </button>
                <button
                  type="button"
                  onClick={() => handleTipoFacturacionChange("presupuesto")}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    tipoFacturacion === "presupuesto" 
                      ? "bg-slate-900 border-slate-900 text-white font-bold" 
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold"
                  } text-[10px] uppercase tracking-wider`}
                >
                  🗺️ Desde Presupuesto
                </button>
                <button
                  type="button"
                  onClick={() => handleTipoFacturacionChange("tickets_caja")}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    tipoFacturacion === "tickets_caja" 
                      ? "bg-slate-900 border-slate-900 text-white font-bold" 
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold"
                  } text-[10px] uppercase tracking-wider`}
                >
                  🛒 Desde Caja / POS
                </button>
              </div>

              {/* Contenido Dinámico según Origen */}
              {tipoFacturacion === "presupuesto" && (
                <label className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Seleccionar Presupuesto de Origen</span>
                  <select
                    value={presupuestoIdSelected}
                    onChange={(e) => handlePresupuestoChange(e.target.value ? Number(e.target.value) : "")}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold focus:outline-none bg-slate-50"
                    required
                  >
                    <option value="">-- Presupuestos pendientes --</option>
                    {presupuestos.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.cliente_nombre} ({p.cliente_rif}) - ${Number(p.total_usd).toFixed(2)} - {new Date(p.created_at).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {/* Selector de Cliente */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Cliente Receptor</span>
                  <select
                    value={clienteSelected}
                    onChange={(e) => setClienteSelected(e.target.value ? Number(e.target.value) : "")}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold focus:outline-none bg-slate-50"
                    disabled={tipoFacturacion === "presupuesto"}
                    required
                  >
                    <option value="">-- Seleccionar Cliente --</option>
                    {clientes.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} ({c.cedula})
                      </option>
                    ))}
                  </select>
                </label>

                {clienteSelected && (
                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col justify-center">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Dirección Fiscal Registrada</p>
                    <p className="text-xs font-semibold text-slate-600 mt-1">
                      {clientes.find(c => c.id === Number(clienteSelected))?.direccion || "No registrada"}
                    </p>
                  </div>
                )}
              </div>

              {/* Tickets de Caja (POS) */}
              {tipoFacturacion === "tickets_caja" && clienteSelected && (
                <div className="space-y-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tickets de Venta POS Disponibles</span>
                  <div className="border border-slate-100 rounded-2xl divide-y divide-slate-100 max-h-48 overflow-y-auto">
                    {tickets.length === 0 ? (
                      <p className="p-4 text-center text-slate-400 text-xs font-medium">No hay tickets de venta pendientes de facturación para este cliente.</p>
                    ) : (
                      tickets.map(t => (
                        <label key={t.id} className="flex items-center gap-3 p-3 hover:bg-slate-50 cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={ticketsSelectedIds.includes(t.id)}
                            onChange={(e) => handleTicketCheckboxChange(t.id, e.target.checked)}
                            className="rounded text-slate-900 focus:ring-slate-900 h-4 w-4"
                          />
                          <div className="flex-1">
                            <p className="font-bold text-slate-800">{t.producto_nombre}</p>
                            <p className="text-[10px] text-slate-400 font-semibold">{Number(t.peso).toFixed(3)} kg - {new Date(t.created_at).toLocaleDateString()}</p>
                          </div>
                          <span className="font-black text-slate-900">${Number(t.monto_usd).toFixed(2)}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Factura Directa - Detalle de Ítems */}
              {tipoFacturacion === "directa" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Detalle de Ítems a Facturar</span>
                    <button
                      type="button"
                      onClick={agregarItemDirecto}
                      className="rounded-xl border border-dashed border-slate-300 hover:border-slate-500 text-slate-600 text-[10px] font-bold px-3 py-1.5 transition-all cursor-pointer"
                    >
                      ➕ Añadir Fila
                    </button>
                  </div>

                  <div className="space-y-2">
                    {itemsDirectos.map((item, index) => (
                      <div key={index} className="grid grid-cols-12 gap-2 items-center bg-slate-50/50 p-2 border border-slate-100 rounded-xl">
                        {/* Producto */}
                        <div className="col-span-4">
                          <select
                            value={item.producto_id}
                            onChange={(e) => actualizarItemDirecto(index, "producto_id", e.target.value)}
                            className="w-full rounded-lg border border-slate-200 p-1.5 text-xs font-semibold focus:outline-none bg-white"
                            required
                          >
                            <option value="0">-- Producto --</option>
                            {productos.map(p => (
                              <option key={p.id} value={p.id}>{p.nombre}</option>
                            ))}
                          </select>
                        </div>
                        {/* Cantidad */}
                        <div className="col-span-2">
                          <input
                            type="number"
                            step="0.001"
                            value={item.cantidad}
                            onChange={(e) => actualizarItemDirecto(index, "cantidad", Number(e.target.value))}
                            placeholder="Cant"
                            className="w-full rounded-lg border border-slate-200 p-1.5 text-xs font-semibold text-center focus:outline-none bg-white"
                            required
                          />
                        </div>
                        {/* Precio */}
                        <div className="col-span-2">
                          <input
                            type="number"
                            step="0.01"
                            value={item.precio_unitario_usd}
                            onChange={(e) => actualizarItemDirecto(index, "precio_unitario_usd", Number(e.target.value))}
                            placeholder="Precio $"
                            className="w-full rounded-lg border border-slate-200 p-1.5 text-xs font-semibold text-right focus:outline-none bg-white"
                            required
                          />
                        </div>
                        {/* IVA checkbox */}
                        <label className="col-span-2 flex items-center justify-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={item.aplica_iva}
                            onChange={(e) => actualizarItemDirecto(index, "aplica_iva", e.target.checked)}
                            className="rounded text-slate-900 focus:ring-slate-900 h-3.5 w-3.5"
                          />
                          <span className="text-[10px] font-bold text-slate-400">IVA</span>
                        </label>
                        {/* Subtotal */}
                        <div className="col-span-1 text-right font-black text-slate-700 text-[10px]">
                          ${(item.cantidad * item.precio_unitario_usd).toFixed(2)}
                        </div>
                        {/* Remover */}
                        <div className="col-span-1 text-center">
                          <button
                            type="button"
                            onClick={() => removerItemDirecto(index)}
                            className="text-rose-500 hover:text-rose-700 font-bold"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {itemsDirectos.length > 0 && (
                    <div className="p-3 bg-slate-900 text-slate-300 rounded-2xl text-[10px] space-y-1">
                      <div className="flex justify-between font-semibold">
                        <span>Monto Exento:</span>
                        <span>${calcularTotalesDirectos().exento.toFixed(2)} USD</span>
                      </div>
                      <div className="flex justify-between font-semibold">
                        <span>Base Imponible:</span>
                        <span>${calcularTotalesDirectos().imponible.toFixed(2)} USD</span>
                      </div>
                      <div className="flex justify-between font-semibold">
                        <span>IVA 16%:</span>
                        <span>${calcularTotalesDirectos().iva.toFixed(2)} USD</span>
                      </div>
                      <div className="flex justify-between font-black text-white text-xs pt-1 border-t border-slate-800">
                        <span>TOTAL GENERAL:</span>
                        <span>${calcularTotalesDirectos().total.toFixed(2)} USD ({ (calcularTotalesDirectos().total * tasaBcv).toFixed(2) } Bs)</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Botón enviar */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowEmision(false)}
                  className="rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold px-4 py-2.5 transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={cargando}
                  className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-5 py-2.5 transition-all cursor-pointer disabled:bg-slate-300"
                >
                  {cargando ? "Emitiendo..." : "✓ Emitir Factura"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DETALLE / VISUALIZADOR FACTURA FISCAL SENIAT */}
      {viewingFactura && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-3xl border border-slate-100 shadow-2xl overflow-hidden my-8 max-h-[90vh] flex flex-col">
            {/* Control Bar (Excluida de impresión) */}
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between print:hidden">
              <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Vista Previa de Factura Fiscal
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => window.print()}
                  className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-bold px-4 py-2 transition-all cursor-pointer"
                >
                  🖨️ Imprimir Factura
                </button>
                <button
                  onClick={() => setViewingFactura(null)}
                  className="rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 text-[10px] font-bold px-4 py-2 transition-all cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </div>

            {/* FISCAL FACTURA CONTENT (Acondicionada para SENIAT e Impresión) */}
            <div className="p-8 flex-1 overflow-y-auto font-mono text-[11px] text-slate-800 space-y-6 print:p-0 print:overflow-visible">
              
              {/* Estilos específicos de impresión */}
              <style>{`
                @media print {
                  body {
                    background-color: white !important;
                    color: black !important;
                    font-size: 10px !important;
                  }
                  .print\\:hidden {
                    display: none !important;
                  }
                  .modal-card {
                    box-shadow: none !important;
                    border: none !important;
                  }
                }
              `}</style>

              {/* Emisor y RIF Header */}
              <div className="grid grid-cols-2 gap-4 border-b pb-4 border-slate-200">
                <div>
                  <h4 className="font-extrabold text-xs uppercase tracking-wide text-slate-900">MiniMarket Express</h4>
                  <p className="text-[9px] text-slate-500 font-semibold mt-0.5">3Q Solutions Suite</p>
                  <p className="mt-1">RIF: J-12345678-9</p>
                  <p>Dirección: Av. Principal de los Llanos, Edif 3Q, Caracas, Venezuela.</p>
                  <p>Teléfono: +58 212 9998877</p>
                </div>
                <div className="text-right border-l pl-4 border-slate-200 flex flex-col justify-center">
                  <h3 className="font-extrabold text-sm text-slate-900">FACTURA</h3>
                  <p className="font-bold text-xs text-rose-600 mt-1">N° {viewingFactura.nro_factura}</p>
                  <p className="font-semibold text-slate-500 mt-0.5">N° DE CONTROL: {viewingFactura.nro_control}</p>
                  <p className="text-slate-400 mt-2">FECHA: {new Date(viewingFactura.created_at).toLocaleDateString()} {new Date(viewingFactura.created_at).toLocaleTimeString()}</p>
                </div>
              </div>

              {/* Receptor (Cliente) */}
              <div className="border-b pb-4 border-slate-200 grid grid-cols-2 gap-4">
                <div>
                  <span className="font-bold text-[9px] text-slate-400 uppercase tracking-widest block mb-0.5">Nombre / Razón Social</span>
                  <p className="font-bold text-slate-800">{viewingFactura.cliente_nombre}</p>
                  <span className="font-bold text-[9px] text-slate-400 uppercase tracking-widest block mt-2 mb-0.5">Dirección Fiscal</span>
                  <p className="text-slate-600 font-semibold">{viewingFactura.cliente_direccion || "No registrada"}</p>
                </div>
                <div>
                  <span className="font-bold text-[9px] text-slate-400 uppercase tracking-widest block mb-0.5">Cédula / RIF</span>
                  <p className="font-mono font-bold text-slate-800">{viewingFactura.cliente_rif}</p>
                </div>
              </div>

              {/* Detalle de Artículos */}
              <table className="w-full text-left border-collapse border-b border-slate-200">
                <thead>
                  <tr className="border-b border-slate-200 font-bold uppercase tracking-wider text-slate-400 text-[9px]">
                    <th className="py-2">Código/Descripción</th>
                    <th className="py-2 text-right">Cant</th>
                    <th className="py-2 text-right">P. Unit ($)</th>
                    <th className="py-2 text-center">IVA</th>
                    <th className="py-2 text-right">Total ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {viewingFactura.items.map(item => (
                    <tr key={item.id} className="align-middle">
                      <td className="py-2.5 font-bold text-slate-800">{item.producto_nombre || "Producto de Catálogo"}</td>
                      <td className="py-2.5 text-right font-semibold">{Number(item.cantidad).toFixed(3)}</td>
                      <td className="py-2.5 text-right font-semibold">${Number(item.precio_unitario_usd).toFixed(2)}</td>
                      <td className="py-2.5 text-center font-bold text-[9px] text-slate-500">{item.aplica_iva ? "16%" : "Exento"}</td>
                      <td className="py-2.5 text-right font-black">${Number(item.subtotal_usd).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totales SENIAT */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col justify-end text-[9px] text-slate-400 leading-normal">
                  <p className="font-semibold text-slate-500">Monto equivalente en Bolívares (VES)</p>
                  <p className="font-black text-brand-primary text-xs mt-0.5">{Number(viewingFactura.total_ves).toFixed(2)} Bs</p>
                  <p className="mt-2 font-bold uppercase tracking-wider">Tasa BCV de Referencia: {Number(viewingFactura.tasa_bcv).toFixed(2)} Bs/USD</p>
                  <p className="italic text-[8px] mt-1">"Operación gravada y exenta calculada de acuerdo con el Art. 25 de la Ley del IVA vigente en Venezuela."</p>
                </div>
                <div className="space-y-1.5 text-right border-l pl-4 border-slate-200">
                  <div className="flex justify-between font-semibold">
                    <span>Subtotal Exento (USD):</span>
                    <span>${Number(viewingFactura.monto_exento_usd).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>Base Imponible (USD):</span>
                    <span>${Number(viewingFactura.monto_imponible_usd).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>IVA 16.00% (USD):</span>
                    <span>${Number(viewingFactura.monto_iva_usd).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-black text-slate-900 text-xs pt-1.5 border-t border-slate-300">
                    <span>TOTAL FACTURA (USD):</span>
                    <span>${Number(viewingFactura.total_usd).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Footer fiscal */}
              <div className="border-t pt-4 border-slate-200 text-center text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                *** GRACIAS POR SU COMPRA *** <br />
                <span className="text-[8px] tracking-wide mt-1 block">ESTA FACTURA CUMPLE CON LAS EXIGENCIAS FISCALES DEL SENIAT VENEZUELA</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
