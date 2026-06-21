import { useState, useEffect } from "react";
import apiClient from "../api/client";
import { DEPARTAMENTOS_PESAJE } from "../lib/departamentos";

interface ProductoPeso {
  id: number;
  nombre: string;
  tipo_venta: string;
  stock_total: number;
}

interface ModalSolicitudDesposteProps {
  onClose: () => void;
  onCreado: () => void;
}

export default function ModalSolicitudDesposte({ onClose, onCreado }: ModalSolicitudDesposteProps) {
  const [productos, setProductos] = useState<ProductoPeso[]>([]);
  const [productoOrigenId, setProductoOrigenId] = useState<number | "">("");
  const [cantidadEstimada, setCantidadEstimada] = useState("");
  const [departamento, setDepartamento] = useState(DEPARTAMENTOS_PESAJE[0].key);
  const [comentario, setComentario] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiClient.get<ProductoPeso[]>("/api/v1/productos")
      .then((res) => setProductos(res.data.filter((p) => p.tipo_venta === "peso")))
      .catch(() => setProductos([]));
  }, []);

  const fmtKg = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  async function enviar() {
    setError("");
    if (!productoOrigenId) {
      setError("Debe seleccionar el producto a despostar.");
      return;
    }
    if (!cantidadEstimada || Number(cantidadEstimada) <= 0) {
      setError("La cantidad estimada debe ser mayor a cero.");
      return;
    }
    setGuardando(true);
    try {
      await apiClient.post("/api/v1/desposte-solicitudes", {
        producto_origen_id: Number(productoOrigenId),
        cantidad_estimada: Number(cantidadEstimada),
        comentario_solicitud: comentario.trim() || undefined,
        departamento,
      });
      onCreado();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? "No se pudo crear la solicitud de desposte.");
    } finally {
      setGuardando(false);
    }
  }

  const labelCls = "text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1";
  const inputCls = "rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-10 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full w-8 h-8 flex items-center justify-center font-bold transition-all"
          title="Cerrar"
        >
          ✕
        </button>
        <h3 className="text-lg font-bold text-slate-900">🥩 Solicitar Desposte</h3>
        <p className="text-xs text-slate-400 mt-0.5 mb-4">
          Balanza Digital verá esta solicitud en su cola de pendientes para pesar y registrar los cortes.
        </p>

        <div className="space-y-3">
          <label className="flex flex-col">
            <span className={labelCls}>Producto a despostar</span>
            <select value={productoOrigenId} onChange={(e) => setProductoOrigenId(Number(e.target.value) || "")} className={inputCls}>
              <option value="">Seleccionar...</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre} (Stock: {fmtKg(p.stock_total)} kg)</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col">
            <span className={labelCls}>Cantidad estimada (kg)</span>
            <input type="number" step="0.001" className={inputCls} value={cantidadEstimada} onChange={(e) => setCantidadEstimada(e.target.value)} placeholder="0.000" />
          </label>

          <label className="flex flex-col">
            <span className={labelCls}>Departamento que ejecuta</span>
            <select value={departamento} onChange={(e) => setDepartamento(e.target.value)} className={inputCls}>
              {DEPARTAMENTOS_PESAJE.map((d) => (
                <option key={d.key} value={d.key}>{d.label}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col">
            <span className={labelCls}>Comentario (opcional)</span>
            <textarea className={inputCls} rows={2} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Ej: para reabastecer cortes de pechuga y muslo" />
          </label>

          {error && <p className="text-xs font-semibold text-rose-600 bg-rose-50 p-2.5 rounded-xl">{error}</p>}

          <button
            type="button"
            disabled={guardando}
            onClick={enviar}
            className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-bold text-sm py-2.5 rounded-xl transition-all"
          >
            {guardando ? "Enviando..." : "Enviar solicitud a Balanza"}
          </button>
        </div>
      </div>
    </div>
  );
}
