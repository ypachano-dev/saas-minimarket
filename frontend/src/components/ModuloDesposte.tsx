import { useState, useEffect } from "react";
import apiClient from "../api/client";

interface Producto {
  id: number;
  codigo_interno: string;
  nombre: string;
  linea: string | null;
  clase_o_tipo: string | null;
  stock_total: number;
  tipo_venta: string;
  precio_1_detalle: number;
}

interface ItemDestinoForm {
  producto_id: number;
  peso: string;
}

interface ModuloDesposteProps {
  // Si viene, este formulario ejecuta una solicitud de desposte ya creada por Caja
  // (producto origen fijo, no se puede desviar) en vez del flujo legacy ad-hoc.
  solicitudId?: number;
  productoOrigenIdPrellenado?: number;
  cantidadEstimadaPrellenada?: number;
  onEjecutado?: (resultado: any) => void;
}

export default function ModuloDesposte({ solicitudId, productoOrigenIdPrellenado, cantidadEstimadaPrellenada, onEjecutado }: ModuloDesposteProps = {}) {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successData, setSuccessData] = useState<any | null>(null);

  // Form states
  const [productoOrigenId, setProductoOrigenId] = useState<number | "">("");
  const [pesoOrigen, setPesoOrigen] = useState("");
  const [itemsDestino, setItemsDestino] = useState<ItemDestinoForm[]>([
    { producto_id: "", peso: "" } as any
  ]);
  const [observaciones, setObservaciones] = useState("");
  const [procesando, setProcesando] = useState(false);

  // Load products from API
  async function cargarProductos() {
    setCargando(true);
    setErrorMsg("");
    try {
      const res = await apiClient.get<Producto[]>("/api/v1/productos");
      setProductos(res.data);
    } catch (err: any) {
      console.error(err);
      setErrorMsg("Error al cargar la lista de productos para desposte.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarProductos();
  }, []);

  // Pre-rellenar producto origen y peso estimado cuando se ejecuta una solicitud de Caja
  useEffect(() => {
    if (productoOrigenIdPrellenado) {
      setProductoOrigenId(productoOrigenIdPrellenado);
      if (cantidadEstimadaPrellenada) {
        setPesoOrigen(String(cantidadEstimadaPrellenada));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productoOrigenIdPrellenado, cantidadEstimadaPrellenada]);

  // Filter products for source (deben venderse por peso y tener stock real: no se puede
  // despostar una materia prima que ya está agotada).
  const productosOrigenList = productos.filter((p) => p.tipo_venta === "peso" && p.stock_total > 0);

  // Get selected source product details
  const prodOrigenSel = productos.find((p) => p.id === productoOrigenId);

  // Cortes resultantes válidos para el producto de origen elegido: mismo departamento
  // (línea, ej. "Carnicería") y, cuando ambos lo tengan etiquetado, misma especie/clase
  // (ej. "POLLO" vs "CERDO") para no mezclar canales de animales distintos. Si alguno de
  // los dos no tiene clase_o_tipo cargado, no se descarta por eso solo (degradación
  // controlada mientras el catálogo no esté completamente etiquetado) — pero nunca se
  // ofrece un producto de otro departamento (Alimentos, Verdulería, etc.) como corte, ni
  // el propio producto de origen como su propio corte resultante.
  const cortesCompatibles = prodOrigenSel
    ? productos.filter((p) => {
        if (p.id === prodOrigenSel.id) return false;
        if (p.linea !== prodOrigenSel.linea) return false;
        if (prodOrigenSel.clase_o_tipo && p.clase_o_tipo) {
          return p.clase_o_tipo === prodOrigenSel.clase_o_tipo;
        }
        return true;
      })
    : [];

  // Calculations
  const pesoOrigenNum = Number(pesoOrigen) || 0;
  const sumaPesosDestino = itemsDestino.reduce((acc, item) => acc + (Number(item.peso) || 0), 0);
  const mermaPeso = Math.max(0, pesoOrigenNum - sumaPesosDestino);
  const mermaPorcentaje = pesoOrigenNum > 0 ? (mermaPeso / pesoOrigenNum) * 100 : 0;
  const rendimientoPorcentaje = pesoOrigenNum > 0 ? (sumaPesosDestino / pesoOrigenNum) * 100 : 0;

  const excedePesoOrigen = sumaPesosDestino > pesoOrigenNum;

  function agregarDestino() {
    setItemsDestino((prev) => [...prev, { producto_id: "", peso: "" } as any]);
  }

  function eliminarDestino(index: number) {
    setItemsDestino((prev) => prev.filter((_, i) => i !== index));
  }

  function actualizarDestino(index: number, key: keyof ItemDestinoForm, val: any) {
    setItemsDestino((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [key]: val } : item))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    setSuccessData(null);

    if (!productoOrigenId) {
      setErrorMsg("Debe seleccionar un producto de origen.");
      return;
    }
    if (pesoOrigenNum <= 0) {
      setErrorMsg("El peso de origen debe ser mayor a cero.");
      return;
    }
    if (excedePesoOrigen) {
      setErrorMsg("La suma de los pesos de los cortes resultantes no puede superar el peso de origen.");
      return;
    }

    // Filter out invalid destination cuts
    const itemsFiltrados = itemsDestino.filter((i) => i.producto_id && Number(i.peso) > 0);
    if (itemsFiltrados.length === 0) {
      setErrorMsg("Debe agregar al menos un corte resultante válido con peso mayor a cero.");
      return;
    }

    setProcesando(true);
    try {
      const itemsPayload = itemsFiltrados.map((item) => ({
        producto_id: Number(item.producto_id),
        peso: Number(item.peso),
      }));

      const res = solicitudId
        ? await apiClient.post(`/api/v1/desposte-solicitudes/${solicitudId}/ejecutar`, {
            peso_origen: pesoOrigenNum,
            items_destino: itemsPayload,
            observaciones: observaciones.trim() || undefined,
          })
        : await apiClient.post("/api/v1/desposte", {
            producto_origen_id: Number(productoOrigenId),
            peso_origen: pesoOrigenNum,
            items_destino: itemsPayload,
            merma_peso: Number(mermaPeso.toFixed(3)),
            observaciones: observaciones.trim() || undefined,
          });

      const desposteResultado = solicitudId ? res.data.desposte : res.data;
      setSuccessData({
        ...desposteResultado,
        prodOrigenName: prodOrigenSel?.nombre,
        itemsDestinoNombres: itemsFiltrados.map((i) => {
          const p = productos.find((prod) => prod.id === Number(i.producto_id));
          return { nombre: p?.nombre ?? "Corte", peso: Number(i.peso) };
        }),
        rendimientoPorcentaje,
        mermaPeso,
        mermaPorcentaje,
      });

      onEjecutado?.(res.data);

      // Reset form
      setProductoOrigenId("");
      setPesoOrigen("");
      setItemsDestino([{ producto_id: "", peso: "" } as any]);
      setObservaciones("");
      cargarProductos(); // Refresh stocks
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.response?.data?.detail ?? "Error al registrar la transacción de desposte.");
    } finally {
      setProcesando(false);
    }
  }

  const fmt = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtKg = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 3, maximumFractionDigits: 3 });  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-100/80 pb-5">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center text-lg shadow-sm">🥩</span>
            Herramienta de Desposte de Canal
          </h2>
          <p className="text-xs font-semibold text-slate-400 mt-1 uppercase tracking-wider">
            Control de rendimiento cárnico · Multi-Tenant Split Stock
          </p>
        </div>
      </div>
      
      {cargando && (
        <div className="p-4 bg-violet-50 border border-violet-100/50 text-violet-750 rounded-2xl text-xs font-semibold animate-pulse flex items-center gap-2">
          <span className="animate-spin text-sm">🔄</span> Sincronizando catálogo de cortes y materias primas del servidor...
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-bold flex items-center gap-2 animate-bounce">
          <span>⚠️ Error:</span> {errorMsg}
        </div>
      )}

      {successData && (
        <div className="p-6 rounded-3xl bg-emerald-50/50 border border-emerald-100 text-slate-800 space-y-4 shadow-xl shadow-emerald-500/5 animate-fade-in relative overflow-hidden">
          <div className="absolute right-4 top-4 text-emerald-200/40 text-7xl select-none font-black opacity-30">✓</div>
          <div>
            <h4 className="font-black text-emerald-800 text-lg uppercase tracking-tight">¡Transacción de Desposte Exitosa!</h4>
            <p className="text-xs text-emerald-600 font-semibold mt-0.5">El inventario se ha actualizado en tiempo real.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-emerald-250/30 pt-4">
            <div className="bg-white/80 backdrop-blur-sm p-4 rounded-2xl border border-emerald-150/40 shadow-sm">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Materia Prima Usada</span>
              <span className="font-bold text-slate-800 text-sm block mt-0.5">{successData.prodOrigenName}</span>
              <span className="font-mono text-xs block text-slate-500 font-semibold mt-1">
                Peso: {fmtKg(successData.peso_origen)} kg
              </span>
            </div>
            <div className="bg-white/80 backdrop-blur-sm p-4 rounded-2xl border border-emerald-150/40 shadow-sm">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Rendimiento Útil</span>
              <span className="font-black text-emerald-600 text-xl font-mono block mt-0.5">
                {successData.rendimientoPorcentaje.toFixed(1)}%
              </span>
              <span className="text-[9px] block text-slate-400 uppercase tracking-widest font-bold mt-1">Cortes Resultantes</span>
            </div>
            <div className="bg-white/80 backdrop-blur-sm p-4 rounded-2xl border border-emerald-150/40 shadow-sm">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Merma de Desposte</span>
              <span className="font-bold text-rose-500 text-sm font-mono block mt-0.5">
                {fmtKg(successData.mermaPeso)} kg
              </span>
              <span className="text-[9px] block text-rose-400 font-semibold mt-1 uppercase tracking-widest">
                Merma: {successData.mermaPorcentaje.toFixed(1)}%
              </span>
            </div>
          </div>

          <div className="bg-white/75 backdrop-blur-sm p-4 rounded-2xl border border-emerald-150/30 space-y-2.5">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Lotes Creados en Inventario:</span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              {successData.itemsDestinoNombres.map((item: any, idx: number) => (
                <div key={idx} className="flex justify-between items-center py-2 px-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                  <span className="font-bold text-slate-700">{item.nombre}</span>
                  <span className="font-mono font-black text-violet-650">{fmtKg(item.peso)} kg</span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => setSuccessData(null)}
              className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-xl transition-all shadow-md active:scale-95"
            >
              Aceptar y Cerrar
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Columns (Inputs for desposte) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card 1: Materia Prima (Source Product) */}
          <div className="glass-card rounded-3xl p-6 shadow-md hover:shadow-lg transition-all duration-300 space-y-4">
            <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs">1</span>
              Seleccione Materia Prima (Canal / Origen)
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex flex-col">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Producto de Origen {solicitudId && <span className="text-violet-500">(fijado por la solicitud)</span>}
                </span>
                {solicitudId ? (
                  <div className="w-full rounded-xl border border-violet-200 bg-violet-50 px-3.5 py-2.5 text-sm font-bold text-violet-800">
                    {prodOrigenSel?.nombre ?? `Producto #${productoOrigenId}`}
                  </div>
                ) : (
                  <select
                    value={productoOrigenId}
                    onChange={(e) => setProductoOrigenId(Number(e.target.value) || "")}
                    required
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 font-bold transition-all text-slate-800"
                  >
                    <option value="">Seleccionar canal...</option>
                    {productosOrigenList.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre} (Stock: {fmtKg(p.stock_total)} kg)
                      </option>
                    ))}
                  </select>
                )}
              </label>

              <label className="flex flex-col">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Peso de Origen a Procesar (kg)
                </span>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={pesoOrigen}
                  onChange={(e) => setPesoOrigen(e.target.value)}
                  placeholder="Ej: 150.250"
                  required
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 font-mono font-bold transition-all text-slate-800"
                />
              </label>
            </div>

            {prodOrigenSel && (
              <div className="bg-slate-50/50 border border-slate-100/50 rounded-2xl p-4 text-xs text-slate-600 flex justify-between items-center animate-fade-in">
                <div>
                  <span className="font-bold text-slate-700 block">Detalles del Canal:</span>
                  <span className="text-[10px] text-slate-400 block font-mono mt-0.5">SKU / CÓDIGO: {prodOrigenSel.codigo_interno}</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 font-medium">Stock Disponible:</span>
                  <span className={`font-mono font-black text-sm block mt-0.5 ${prodOrigenSel.stock_total <= 10 ? "text-rose-600" : "text-emerald-600"}`}>
                    {fmtKg(prodOrigenSel.stock_total)} kg
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Card 2: Destination Cuts */}
          <div className="glass-card rounded-3xl p-6 shadow-md hover:shadow-lg transition-all duration-300 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100/60 pb-3">
              <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs">2</span>
                Cortes Resultantes (Salida Comercial)
              </h3>
              <button
                type="button"
                onClick={agregarDestino}
                className="text-xs text-violet-600 hover:text-white font-bold bg-violet-50 hover:bg-violet-600 px-3.5 py-2 rounded-xl transition-all duration-300 border border-violet-100 hover:border-violet-600 active:scale-95 shadow-sm"
              >
                + Añadir Corte
              </button>
            </div>

            <div className="space-y-3">
              {itemsDestino.map((item, idx) => (
                <div key={idx} className="flex flex-col md:flex-row gap-3 items-end bg-slate-50/20 hover:bg-slate-50/50 p-4 border border-slate-150/40 rounded-2xl relative group transition-all duration-300">
                  <label className="flex-1 flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Corte Resultante
                    </span>
                    <select
                      value={item.producto_id}
                      onChange={(e) => actualizarDestino(idx, "producto_id", Number(e.target.value) || "")}
                      required
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 font-semibold transition-all text-slate-800"
                    >
                      <option value="">{prodOrigenSel ? "Seleccionar corte..." : "Primero elija la materia prima"}</option>
                      {cortesCompatibles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre} (${fmt(p.precio_1_detalle)}/kg)
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="w-full md:w-40 flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Peso Obtenido (kg)
                    </span>
                    <input
                      type="number"
                      step="0.001"
                      min="0.001"
                      value={item.peso}
                      onChange={(e) => actualizarDestino(idx, "peso", e.target.value)}
                      placeholder="0.000"
                      required
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 font-mono font-bold transition-all text-slate-800"
                    />
                  </label>

                  {itemsDestino.length > 1 && (
                    <button
                      type="button"
                      onClick={() => eliminarDestino(idx)}
                      className="bg-rose-50 hover:bg-rose-500 text-rose-500 hover:text-white rounded-xl p-2.5 border border-rose-100 hover:border-rose-500 transition-all duration-300 text-xs active:scale-90"
                      title="Eliminar corte"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Sidebar: Yield Analytics & Submit */}
        <div className="glass-card rounded-3xl p-6 shadow-md border border-slate-100 space-y-6 lg:col-span-1 h-fit sticky top-6 hover:shadow-lg transition-all duration-300">
          <div>
            <h3 className="text-sm font-black uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
              <span>📊</span> Balance de Rendimiento
            </h3>
            <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wide font-semibold">Factor de rendimiento y mermas</p>
          </div>

          <div className="space-y-4">
            {/* Visual Gauge Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold text-slate-650">
                <span>Rendimiento Útil:</span>
                <span className="font-mono text-emerald-600 font-black">{rendimientoPorcentaje.toFixed(1)}%</span>
              </div>
              <div className="w-full h-3.5 bg-slate-100 rounded-full overflow-hidden flex border border-slate-200/50 p-0.5">
                <div
                  className="bg-gradient-to-r from-emerald-400 to-emerald-600 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${Math.min(rendimientoPorcentaje, 100)}%` }}
                />
                <div
                  className="bg-rose-500 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${Math.min(mermaPorcentaje, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-bold text-slate-400 tracking-wider">
                <span>CORTES ({rendimientoPorcentaje.toFixed(1)}%)</span>
                <span>MERMA ({mermaPorcentaje.toFixed(1)}%)</span>
              </div>
            </div>

            <div className="divide-y divide-slate-100 text-xs font-medium space-y-3 pt-2">
              <div className="flex justify-between py-1.5">
                <span className="text-slate-500">Materia Prima (Canal):</span>
                <span className="font-mono text-slate-700 font-bold">{fmtKg(pesoOrigenNum)} kg</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-slate-500">Peso Total Cortes:</span>
                <span className="font-mono text-slate-700 font-bold">{fmtKg(sumaPesosDestino)} kg</span>
              </div>
              <div className="flex justify-between py-1.5 items-center">
                <div>
                  <span className="text-slate-500 block">Merma de Sangre/Hueso:</span>
                  <span className="text-[9px] text-slate-400 block font-normal">Hueso grueso, grasa, merma natural</span>
                </div>
                <span className={`font-mono text-sm font-black ${mermaPeso > 0 ? "text-rose-500 animate-pulse" : "text-slate-700"}`}>
                  {fmtKg(mermaPeso)} kg
                </span>
              </div>
            </div>

            {excedePesoOrigen && (
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-[10px] font-bold text-rose-600 animate-bounce">
                ⚠️ Error: El peso total de los cortes resultantes supera el peso original.
              </div>
            )}

            <label className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Observaciones del Proceso
              </span>
              <textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Ej. Canal de novillo Premium. Hueso grueso, grasa media..."
                rows={3}
                className="w-full rounded-xl border border-slate-200 p-3 text-xs bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 font-medium transition-all text-slate-800"
              />
            </label>

            <button
              type="submit"
              disabled={procesando || excedePesoOrigen || pesoOrigenNum <= 0 || itemsDestino.some(i => !i.producto_id || !i.peso)}
              className="w-full bg-gradient-to-r from-violet-600 to-indigo-650 hover:from-violet-700 hover:to-indigo-700 text-white font-bold rounded-2xl py-3.5 text-xs transition-all shadow-lg shadow-violet-500/10 hover:shadow-violet-500/20 active:scale-[0.98] disabled:from-slate-100 disabled:to-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed uppercase tracking-wider"
            >
              {procesando ? "Procesando Desposte..." : "Procesar Desposte 🥩"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
