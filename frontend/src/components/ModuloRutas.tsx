import { useState, useEffect } from "react";
import apiClient from "../api/client";

interface Cliente {
  id: number;
  nombre: string;
}

interface RutaActividad {
  id?: number;
  cliente_id?: number;
  cliente_nombre?: string;
  fecha_planificada: string;
  actividad_planificada: string;
  ejecutada: boolean;
  comentarios_avance?: string;
  foto_soporte_url?: string;
  factura_soporte_monto?: number;
}

interface RutaVendedor {
  id: number;
  vendedor_id: number;
  vendedor_nombre?: string;
  nombre_ruta: string;
  fecha_inicio: string;
  fecha_fin: string;
  estatus: string;
  monto_viaticos_solicitado: number;
  monto_viaticos_aprobado: number;
  detalles_viaticos?: string;
  comentarios_gerente?: string;
  created_at: string;
  actividades: RutaActividad[];
}

interface VendedorUbicacion {
  id: number;
  nombre: string;
  email: string;
  lat?: number;
  lng?: number;
  ubicacion_actualizada_en?: string;
}

export default function ModuloRutas({ rol }: { rol?: string | null }) {
  const [rutas, setRutas] = useState<RutaVendedor[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [vendedores, setVendedores] = useState<VendedorUbicacion[]>([]);
  const [loading, setLoading] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  // Formulario para crear ruta
  const [nombreRuta, setNombreRuta] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [viaticosSol, setViaticosSol] = useState(0);
  const [viaticosDetalle, setViaticosDetalle] = useState("");
  const [actividades, setActividades] = useState<RutaActividad[]>([]);

  // Campos para añadir actividad individual
  const [actClienteId, setActClienteId] = useState("");
  const [actFecha, setActFecha] = useState("");
  const [actDescripcion, setActDescripcion] = useState("");

  // Control de modales y edición
  const [rutaSeleccionada, setRutaSeleccionada] = useState<RutaVendedor | null>(null);
  const [actividadEditar, setActividadEditar] = useState<RutaActividad | null>(null);
  
  // Campos de avance de actividad
  const [comentariosAvance, setComentariosAvance] = useState("");
  const [montoSoporte, setMontoSoporte] = useState(0);
  const [fotoSoporte, setFotoSoporte] = useState("");

  // Campos de aprobación de viáticos
  const [montoAprobar, setMontoAprobar] = useState(0);
  const [comentariosGerente, setComentariosGerente] = useState("");

  // Vista activa: "mis-rutas", "nueva-ruta", "mapa-vendedores", "aprobaciones"
  const [subView, setSubView] = useState<"mis-rutas" | "nueva-ruta" | "mapa-vendedores" | "aprobaciones">("mis-rutas");

  useEffect(() => {
    cargarRutas();
    cargarClientes();
    if (rol === "admin" || rol === "propietario") {
      cargarVendedoresUbicaciones();
    }
  }, [rol]);

  const cargarRutas = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<RutaVendedor[]>("/api/v1/rutas");
      setRutas(res.data);
    } catch {
      setRutas([]);
    } finally {
      setLoading(false);
    }
  };

  const cargarClientes = async () => {
    try {
      const res = await apiClient.get<Cliente[]>("/api/v1/clientes");
      setClientes(res.data);
    } catch {
      setClientes([]);
    }
  };

  const cargarVendedoresUbicaciones = async () => {
    try {
      const res = await apiClient.get<VendedorUbicacion[]>("/api/v1/usuarios/vendedores/ubicaciones");
      setVendedores(res.data);
    } catch {
      setVendedores([]);
    }
  };

  const agregarActividadLista = () => {
    if (!actFecha || !actDescripcion) return;
    const cli = clientes.find((c) => c.id === Number(actClienteId));
    const nuevaAct: RutaActividad = {
      cliente_id: actClienteId ? Number(actClienteId) : undefined,
      cliente_nombre: cli ? cli.nombre : undefined,
      fecha_planificada: actFecha,
      actividad_planificada: actDescripcion,
      ejecutada: false
    };
    setActividades([...actividades, nuevaAct]);
    setActClienteId("");
    setActDescripcion("");
  };

  const removerActividadLista = (idx: number) => {
    setActividades(actividades.filter((_, i) => i !== idx));
  };

  const guardarNuevaRuta = async () => {
    if (!nombreRuta || !fechaInicio || !fechaFin || actividades.length === 0) {
      setMensaje({ tipo: "error", texto: "Debes llenar todos los datos de la ruta y añadir al menos una actividad." });
      return;
    }
    setLoading(true);
    setMensaje(null);
    try {
      const payload = {
        nombre_ruta: nombreRuta,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        monto_viaticos_solicitado: viaticosSol,
        detalles_viaticos: viaticosDetalle,
        actividades: actividades.map((a) => ({
          cliente_id: a.cliente_id,
          fecha_planificada: a.fecha_planificada,
          actividad_planificada: a.actividad_planificada
        }))
      };

      await apiClient.post("/api/v1/rutas", payload);
      setMensaje({ tipo: "ok", texto: "Ruta y solicitud de viáticos creadas exitosamente." });
      setNombreRuta("");
      setFechaInicio("");
      setFechaFin("");
      setViaticosSol(0);
      setViaticosDetalle("");
      setActividades([]);
      cargarRutas();
      setSubView("mis-rutas");
    } catch (err: any) {
      setMensaje({ tipo: "error", texto: err.response?.data?.detail || "No se pudo registrar la ruta." });
    } finally {
      setLoading(false);
    }
  };

  const reportarAvanceActividad = async () => {
    if (!actividadEditar) return;
    setLoading(true);
    setMensaje(null);
    try {
      await apiClient.post(`/api/v1/rutas/actividades/${actividadEditar.id}/avance`, {
        ejecutada: true,
        comentarios_avance: comentariosAvance,
        foto_soporte_url: fotoSoporte || "https://img.freepik.com/foto-gratis/primer-plano-recibo-compra_23-2150931215.jpg",
        factura_soporte_monto: montoSoporte
      });

      setMensaje({ tipo: "ok", texto: "Avance de actividad registrado con éxito." });
      setActividadEditar(null);
      setComentariosAvance("");
      setMontoSoporte(0);
      setFotoSoporte("");
      cargarRutas();
      if (rutaSeleccionada) {
        // refrescar ruta seleccionada en modal
        const refreshed = rutas.find((r) => r.id === rutaSeleccionada.id);
        if (refreshed) setRutaSeleccionada(refreshed);
      }
    } catch {
      setMensaje({ tipo: "error", texto: "No se pudo registrar el avance." });
    } finally {
      setLoading(false);
    }
  };

  const aprobarRutaViaticos = async (rutaId: number, estatus: "aprobada" | "rechazada") => {
    setLoading(true);
    setMensaje(null);
    try {
      await apiClient.put(`/api/v1/rutas/${rutaId}/estado`, {
        estatus,
        monto_viaticos_aprobado: estatus === "aprobada" ? montoAprobar : 0,
        comentarios_gerente: comentariosGerente
      });

      setMensaje({ tipo: "ok", texto: `La ruta ha sido ${estatus} exitosamente.` });
      setRutaSeleccionada(null);
      setMontoAprobar(0);
      setComentariosGerente("");
      cargarRutas();
    } catch {
      setMensaje({ tipo: "error", texto: "No se pudo actualizar el estatus de la ruta." });
    } finally {
      setLoading(false);
    }
  };

  // Filtrar rutas pendientes para panel de gerente
  const rutasPendientes = rutas.filter((r) => r.estatus === "pendiente_aprobacion");

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-emerald-950">Agenda, Rutas y Viáticos</h2>
          <p className="text-slate-500 text-sm">Planificación de visitas semanales, control de gastos de viáticos y monitoreo en tiempo real.</p>
        </div>

        {/* Sub-navegación */}
        <div className="flex gap-2">
          <button
            onClick={() => setSubView("mis-rutas")}
            className={`rounded-full px-4 py-1.5 text-xs font-bold transition-all ${subView === "mis-rutas" ? "bg-emerald-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            📋 Mis Rutas
          </button>
          {rol === "vendedor" && (
            <button
              onClick={() => setSubView("nueva-ruta")}
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition-all ${subView === "nueva-ruta" ? "bg-emerald-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              ➕ Nueva Planificación
            </button>
          )}
          {(rol === "admin" || rol === "propietario") && (
            <>
              <button
                onClick={() => setSubView("aprobaciones")}
                className={`rounded-full px-4 py-1.5 text-xs font-bold transition-all relative ${subView === "aprobaciones" ? "bg-emerald-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                💼 Aprobaciones
                {rutasPendientes.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-black">
                    {rutasPendientes.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => {
                  setSubView("mapa-vendedores");
                  cargarVendedoresUbicaciones();
                }}
                className={`rounded-full px-4 py-1.5 text-xs font-bold transition-all ${subView === "mapa-vendedores" ? "bg-emerald-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                🛰️ Mapa RTCs
              </button>
            </>
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

      {loading && <div className="text-center py-12 text-slate-400 font-semibold text-sm">Procesando...</div>}

      {/* 1. Vista Listado de Rutas */}
      {subView === "mis-rutas" && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-6">
          <h3 className="text-lg font-black text-slate-900 border-b border-slate-50 pb-3">Rutas Planificadas</h3>
          {rutas.length === 0 ? (
            <p className="text-xs text-slate-400 italic text-center py-12">No hay rutas planificadas para mostrar.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {rutas.map((r) => {
                const totalAct = r.actividades.length;
                const completadas = r.actividades.filter((a) => a.ejecutada).length;
                const pct = totalAct > 0 ? Math.round((completadas / totalAct) * 100) : 0;
                
                return (
                  <div key={r.id} className="border border-slate-100 hover:border-slate-200 rounded-3xl p-5 bg-slate-50/20 shadow-sm space-y-4 hover:shadow-md transition-all">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-extrabold text-sm text-slate-900 leading-tight">{r.nombre_ruta}</h4>
                        <p className="text-[10px] text-slate-400 font-bold mt-1">Vendedor: {r.vendedor_nombre || "RTC"}</p>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                        r.estatus === "pendiente_aprobacion" ? "bg-amber-100 text-amber-800 animate-pulse" :
                        r.estatus === "aprobada" ? "bg-emerald-100 text-emerald-800" :
                        r.estatus === "completada" ? "bg-blue-100 text-blue-800" : "bg-red-100 text-red-800"
                      }`}>
                        {r.estatus}
                      </span>
                    </div>

                    <div className="text-xs font-semibold text-slate-600 space-y-1">
                      <p>📅 Rango: {r.fecha_inicio} al {r.fecha_fin}</p>
                      <p>💵 Viáticos: Solicitado: <span className="text-slate-800">${r.monto_viaticos_solicitado.toFixed(2)}</span> | Aprobado: <span className="text-emerald-700">${r.monto_viaticos_aprobado.toFixed(2)}</span></p>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase">
                        <span>Progreso de Actividades</span>
                        <span>{pct}% ({completadas}/{totalAct})</span>
                      </div>
                      <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                        <div className="bg-emerald-600 h-full transition-all duration-500" style={{ width: `${pct}%` }}></div>
                      </div>
                    </div>

                    <button
                      onClick={() => setRutaSeleccionada(r)}
                      className="w-full bg-slate-900 hover:bg-slate-700 text-white font-bold py-2 rounded-xl text-xs transition-all"
                    >
                      👁️ Ver Detalle y Reportar Avances
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 2. Vista Crear Nueva Ruta */}
      {subView === "nueva-ruta" && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-6">
          <h3 className="text-lg font-black text-slate-900 border-b border-slate-50 pb-3">Planificar Actividades Semanales y Solicitar Viáticos</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex flex-col col-span-1 md:col-span-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Nombre Descriptivo de la Ruta</span>
              <input
                type="text"
                className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
                placeholder="Ej. Ruta Centro-Sur — Visita Distribuidores Agro"
                value={nombreRuta}
                onChange={(e) => setNombreRuta(e.target.value)}
              />
            </label>
            <label className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Fecha Inicio</span>
              <input
                type="date"
                className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
              />
            </label>
            <label className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Fecha Fin</span>
              <input
                type="date"
                className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
              />
            </label>
            <label className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Presupuesto Viáticos Solicitado ($)</span>
              <input
                type="number"
                className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
                value={viaticosSol}
                onChange={(e) => setViaticosSol(Number(e.target.value))}
              />
            </label>
            <label className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Desglose/Detalles de Viáticos</span>
              <input
                type="text"
                className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
                placeholder="Combustible: $60, Hospedaje: $50, Comidas: $40"
                value={viaticosDetalle}
                onChange={(e) => setViaticosDetalle(e.target.value)}
              />
            </label>
          </div>

          {/* Formulario interno añadir actividad */}
          <div className="border-t border-slate-100 pt-6">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Agenda de Actividades (Visitas)</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
              <label className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cliente Asociado (Opcional)</span>
                <select
                  className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  value={actClienteId}
                  onChange={(e) => setActClienteId(e.target.value)}
                >
                  <option value="">Ninguno / Genérica</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Fecha Planificada</span>
                <input
                  type="date"
                  className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  value={actFecha}
                  onChange={(e) => setActFecha(e.target.value)}
                />
              </label>

              <label className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Descripción Actividad</span>
                <input
                  type="text"
                  className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  placeholder="Ej. Chequear stock de fertilizantes en tienda"
                  value={actDescripcion}
                  onChange={(e) => setActDescripcion(e.target.value)}
                />
              </label>

              <button
                onClick={agregarActividadLista}
                className="col-span-1 md:col-span-3 bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 rounded-xl text-xs transition-all mt-2"
              >
                ➕ Agregar Actividad a la Agenda
              </button>
            </div>

            {/* Listado de actividades añadidas */}
            <div className="mt-4 space-y-2">
              {actividades.map((a, idx) => (
                <div key={idx} className="flex justify-between items-center border border-slate-100 rounded-xl p-3 bg-slate-50/30 text-xs font-semibold text-slate-800">
                  <div>
                    <p className="font-extrabold text-slate-900">📌 {a.actividad_planificada}</p>
                    <p className="text-[10px] text-slate-400 mt-1">Día: {a.fecha_planificada} {a.cliente_nombre ? `| Cliente: ${a.cliente_nombre}` : ""}</p>
                  </div>
                  <button
                    onClick={() => removerActividadLista(idx)}
                    className="text-red-500 hover:text-red-700 font-bold"
                  >
                    Eliminar
                  </button>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={guardarNuevaRuta}
            className="w-full mt-6 bg-emerald-800 hover:bg-emerald-950 text-white font-bold py-3 rounded-2xl shadow-lg shadow-emerald-800/10 transition-all text-xs"
          >
            Confirmar y Enviar Ruta para Aprobación
          </button>
        </div>
      )}

      {/* 3. Panel de Aprobaciones del Gerente */}
      {subView === "aprobaciones" && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-6">
          <h3 className="text-lg font-black text-slate-900 border-b border-slate-50 pb-3">Autorizar Rutas y Viáticos de Vendedores</h3>
          {rutasPendientes.length === 0 ? (
            <p className="text-xs text-slate-400 italic text-center py-12">No hay rutas ni presupuestos de viáticos pendientes de aprobación.</p>
          ) : (
            <div className="space-y-4">
              {rutasPendientes.map((r) => (
                <div key={r.id} className="border border-amber-100 rounded-3xl p-5 bg-amber-50/10 shadow-inner space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-extrabold text-sm text-slate-900 leading-tight">{r.nombre_ruta}</h4>
                      <p className="text-[10px] text-amber-700 font-bold mt-1">RTC Solicitante: {r.vendedor_nombre || "RTC"}</p>
                      <p className="text-xs text-slate-500 mt-1">Rango: {r.fecha_inicio} al {r.fecha_fin}</p>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-amber-100 text-amber-800 animate-pulse">
                      Pendiente
                    </span>
                  </div>

                  <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100 text-xs font-semibold text-slate-700 space-y-2">
                    <p className="font-extrabold text-slate-900">💵 Presupuesto Solicitado: <span className="text-emerald-700 font-black">${r.monto_viaticos_solicitado.toFixed(2)}</span></p>
                    <p className="text-slate-500 leading-normal"><span className="text-slate-400">Detalle de Gastos:</span> {r.detalles_viaticos || "Sin detalle"}</p>
                    <p className="font-bold mt-2">📌 Actividades planificadas en ruta:</p>
                    <ul className="list-disc pl-4 space-y-1 text-slate-600">
                      {r.actividades.map((a, idx) => (
                        <li key={idx}>{a.fecha_planificada}: {a.actividad_planificada} {a.cliente_nombre ? `(${a.cliente_nombre})` : ""}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex flex-col md:flex-row gap-3 items-end pt-2">
                    <label className="flex flex-col w-48">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Monto Viáticos Autorizado ($)</span>
                      <input
                        type="number"
                        className="mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                        placeholder="Ej. 150"
                        onChange={(e) => setMontoAprobar(Number(e.target.value))}
                      />
                    </label>
                    <label className="flex flex-col flex-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Observaciones/Instrucciones de Gerencia</span>
                      <input
                        type="text"
                        className="mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                        placeholder="Comentarios de viáticos autorizados..."
                        value={comentariosGerente}
                        onChange={(e) => setComentariosGerente(e.target.value)}
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => aprobarRutaViaticos(r.id, "aprobada")}
                        className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-2 px-4 rounded-xl text-xs shadow-md transition-all whitespace-nowrap"
                      >
                        ✓ Aprobar
                      </button>
                      <button
                        onClick={() => aprobarRutaViaticos(r.id, "rechazada")}
                        className="bg-red-50 text-red-700 hover:bg-red-100 font-bold py-2 px-4 rounded-xl text-xs transition-all whitespace-nowrap"
                      >
                        ✕ Rechazar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 4. Vista Mapa Satelital RTCs (GPS en Vivo) */}
      {subView === "mapa-vendedores" && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-6">
          <div className="flex justify-between items-center border-b border-slate-50 pb-3">
            <h3 className="text-lg font-black text-slate-900">Ubicación GPS en Tiempo Real de Vendedores (RTC)</h3>
            <button
              onClick={cargarVendedoresUbicaciones}
              className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold px-4 py-1.5 rounded-xl text-xs"
            >
              🔄 Recargar Ubicaciones
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Lista de Vendedores */}
            <div className="border border-slate-100 rounded-3xl p-4 divide-y divide-slate-50 max-h-[450px] overflow-y-auto">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 px-2">Vendedores Activos</h4>
              {vendedores.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-6 px-2">No hay vendedores registrados.</p>
              ) : (
                vendedores.map((v) => (
                  <div key={v.id} className="py-3 px-2 flex items-center justify-between text-xs font-semibold text-slate-700">
                    <div>
                      <p className="font-extrabold text-slate-900">{v.nombre}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{v.email}</p>
                      <p className="text-[9px] text-emerald-600 font-black mt-1 uppercase tracking-wide">
                        {v.lat && v.lng ? "🟢 En línea (GPS)" : "🔴 Sin señal GPS"}
                      </p>
                    </div>
                    {v.lat && v.lng && (
                      <span className="text-[9px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">
                        {v.lat.toFixed(3)}, {v.lng.toFixed(3)}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Mapa de Tracking (Representación SVG local robusta de la zona de Barinas) */}
            <div className="lg:col-span-2 border border-slate-100 rounded-3xl p-4 bg-slate-900 flex flex-col justify-between items-center relative overflow-hidden h-[450px]">
              <div className="absolute top-4 left-4 z-10 bg-slate-800/80 backdrop-blur-sm px-3 py-1.5 rounded-xl border border-white/5 text-[10px] font-bold text-white uppercase tracking-wider">
                Barinas, Venezuela - Zona de Despliegue Agropecuario
              </div>

              {/* El Grid satelital en SVG */}
              <svg className="w-full h-full min-h-[350px] bg-slate-950 rounded-2xl" viewBox="0 0 500 400">
                {/* Grid Lines */}
                <defs>
                  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />

                {/* Mock Carreteras y Ríos */}
                <path d="M 0,200 L 500,200" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" strokeLinecap="round" /> {/* Troncal 5 */}
                <path d="M 250,0 L 250,400" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" strokeLinecap="round" />
                <path d="M 0,50 Q 150,120 250,220 T 500,320" fill="none" stroke="rgba(16,185,129,0.15)" strokeWidth="3" /> {/* Río Santo Domingo */}

                {/* Etiquetas de Puntos de Interés */}
                <text x="25" y="190" fill="rgba(255,255,255,0.2)" fontSize="9" fontWeight="bold">Troncal 5 (Occidente)</text>
                <text x="320" y="80" fill="rgba(255,255,255,0.2)" fontSize="9" fontWeight="bold">Sabaneta</text>
                <text x="260" y="320" fill="rgba(255,255,255,0.2)" fontSize="9" fontWeight="bold">Barinas Centro</text>

                {/* Clientes Agropecuarios */}
                <circle cx="120" cy="180" r="6" fill="#10b981" opacity="0.3" />
                <circle cx="120" cy="180" r="3" fill="#10b981" />
                <text x="130" y="184" fill="rgba(255,255,255,0.4)" fontSize="8">Hacienda Coromoto</text>

                <circle cx="350" cy="120" r="6" fill="#10b981" opacity="0.3" />
                <circle cx="350" cy="120" r="3" fill="#10b981" />
                <text x="360" y="124" fill="rgba(255,255,255,0.4)" fontSize="8">Agropecuaria El Torito</text>

                {/* Vendedores RTC en Vivo */}
                {vendedores.map((v) => {
                  if (!v.lat || !v.lng) return null;
                  
                  // Mapear coordenadas de Barinas (lat: 10.48, lng: -66.9) a coordenadas SVG
                  // Usamos un offset para posicionar en el cuadrante central
                  const latOffset = (v.lat - 10.48) * 5000 + 250;
                  const lngOffset = (v.lng - (-66.9)) * 5000 + 200;
                  const x = Math.max(20, Math.min(480, latOffset));
                  const y = Math.max(20, Math.min(380, lngOffset));

                  return (
                    <g key={v.id}>
                      {/* Onda de posición */}
                      <circle cx={x} cy={y} r="18" fill="#3b82f6" opacity="0.15">
                        <animate attributeName="r" values="8;20;8" dur="3s" repeatCount="indefinite" />
                      </circle>
                      {/* Marcador */}
                      <circle cx={x} cy={y} r="5" fill="#3b82f6" stroke="#fff" strokeWidth="1.5" />
                      {/* Etiqueta Vendedor */}
                      <rect x={x - 45} y={y - 28} width="90" height="16" rx="6" fill="rgba(30,41,59,0.9)" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                      <text x={x} y={y - 17} fill="#fff" fontSize="8" fontWeight="bold" textAnchor="middle">{v.nombre.split(" ")[0]}</text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Detalle de Ruta Seleccionada */}
      {rutaSeleccionada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">{rutaSeleccionada.nombre_ruta}</h3>
                <p className="text-[10px] text-slate-400 font-bold mt-1">Estatus: {rutaSeleccionada.estatus.toUpperCase()}</p>
              </div>
              <button
                onClick={() => setRutaSeleccionada(null)}
                className="text-slate-400 hover:text-slate-600 font-black text-sm"
              >
                ✕ Cerrar
              </button>
            </div>

            <div className="text-xs font-semibold text-slate-700 bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-2">
              <p>📅 Rango Semanal: {rutaSeleccionada.fecha_inicio} al {rutaSeleccionada.fecha_fin}</p>
              <p>💵 Viáticos: Solicitado: <span className="text-slate-800">${rutaSeleccionada.monto_viaticos_solicitado.toFixed(2)}</span> | Aprobado: <span className="text-emerald-700 font-bold">${rutaSeleccionada.monto_viaticos_aprobado.toFixed(2)}</span></p>
              {rutaSeleccionada.detalles_viaticos && <p><span className="text-slate-400">Detalles Solicitud:</span> {rutaSeleccionada.detalles_viaticos}</p>}
              {rutaSeleccionada.comentarios_gerente && <p><span className="text-slate-400">Mensaje de Gerencia:</span> <span className="text-emerald-950 font-bold">{rutaSeleccionada.comentarios_gerente}</span></p>}
            </div>

            {/* Listado de Actividades / Agenda Checklist */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Checklist de Agenda Diaria</h4>
              {rutaSeleccionada.actividades.map((a, idx) => (
                <div key={idx} className="flex justify-between items-start border border-slate-100 rounded-2xl p-4 bg-slate-50/20 text-xs font-semibold">
                  <div className="space-y-1">
                    <p className="font-extrabold text-slate-900">
                      {a.ejecutada ? "🟢" : "⚪"} {a.actividad_planificada} {a.cliente_nombre ? `(${a.cliente_nombre})` : ""}
                    </p>
                    <p className="text-[10px] text-slate-400">Fecha planificada: {a.fecha_planificada}</p>
                    {a.comentarios_avance && (
                      <p className="bg-white border border-slate-100 rounded-xl p-2 text-slate-600 font-normal leading-relaxed mt-2">
                        <span className="font-bold text-slate-700">Comentarios RTC:</span> {a.comentarios_avance}
                      </p>
                    )}
                    {a.factura_soporte_monto ? (
                      <p className="text-[10px] text-emerald-700 font-bold mt-1">🧾 Soporte de Viático: ${a.factura_soporte_monto.toFixed(2)}</p>
                    ) : null}
                  </div>
                  <div>
                    {!a.ejecutada && rol === "vendedor" && rutaSeleccionada.estatus === "aprobada" && (
                      <button
                        onClick={() => {
                          setActividadEditar(a);
                          setComentariosAvance("");
                          setMontoSoporte(0);
                        }}
                        className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-1.5 px-3 rounded-lg text-[10px] shadow"
                      >
                        ✓ Reportar Ejecución
                      </button>
                    )}
                    {a.ejecutada && (
                      <span className="text-[10px] text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full font-black uppercase">
                        Ejecutada
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Modal Interno para Reportar Ejecución de Actividad */}
            {actividadEditar && (
              <div className="border border-emerald-100 rounded-3xl p-5 bg-emerald-50/10 space-y-4">
                <h4 className="font-extrabold text-sm text-emerald-950">Reportar Avance: {actividadEditar.actividad_planificada}</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="flex flex-col col-span-1 md:col-span-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Notas / Comentarios de Avance de Visita</span>
                    <textarea
                      rows={2}
                      className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                      placeholder="Indica qué se ejecutó y comentarios..."
                      value={comentariosAvance}
                      onChange={(e) => setComentariosAvance(e.target.value)}
                    />
                  </label>
                  <label className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Monto Factura/Gasto de Viático ($)</span>
                    <input
                      type="number"
                      className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                      value={montoSoporte}
                      onChange={(e) => setMontoSoporte(Number(e.target.value))}
                    />
                  </label>
                  <label className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Foto Soporte / Recibo Factura (URL)</span>
                    <input
                      type="text"
                      className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                      placeholder="url de foto de factura o soporte..."
                      value={fotoSoporte}
                      onChange={(e) => setFotoSoporte(e.target.value)}
                    />
                  </label>
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  <button
                    onClick={reportarAvanceActividad}
                    className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-2 px-4 rounded-xl text-xs transition-all"
                  >
                    Guardar Avance
                  </button>
                  <button
                    onClick={() => setActividadEditar(null)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 px-4 rounded-xl text-xs transition-all"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
