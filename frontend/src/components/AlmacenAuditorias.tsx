import { useState, useEffect } from "react";
import apiClient from "../api/client";

interface AuditoriaItem {
  id: number;
  producto_id: number;
  producto_nombre: string | null;
  cantidad_sistema: number;
  cantidad_fisica: number | null;
  diferencia: number | null;
}

interface Auditoria {
  id: number;
  fecha: string;
  status: string;
  notas: string | null;
  items: AuditoriaItem[];
}

interface Producto { id: number; linea: string | null; }

const BASE_LINEAS = [
  "Carnicería","Charcutería","Verdulería y Frutas","Víveres","Bebidas",
  "Lácteos y Derivados","Limpieza y Hogar","Cuidado Personal","Panadería y Dulces",
  "Ferretería","Otros",
];

const inputCls = "rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const fmtKg = (n: number | string) => Number(n).toLocaleString("es-VE", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export default function AlmacenAuditorias() {
  const [auditorias, setAuditorias] = useState<Auditoria[]>([]);
  const [lineas, setLineas] = useState<string[]>([]);
  const [auditoriaActiva, setAuditoriaActiva] = useState<Auditoria | null>(null);
  const [lineaFiltro, setLineaFiltro] = useState("");
  const [conteos, setConteos] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [abriendo, setAbriendo] = useState(false);
  const [cerrando, setCerrando] = useState(false);

  function cargarHistorial() {
    apiClient.get<Auditoria[]>("/api/v1/almacen/auditorias").then((res) => {
      setAuditorias(res.data);
      const abierta = res.data.find((a) => a.status === "abierta");
      if (abierta && !auditoriaActiva) {
        setAuditoriaActiva(abierta);
      }
    }).catch(() => {});
    apiClient.get<Producto[]>("/api/v1/productos").then((res) => {
      const desdeProductos = res.data.map((p) => p.linea).filter((l): l is string => Boolean(l));
      const merged = Array.from(new Set([...BASE_LINEAS, ...desdeProductos])).sort();
      setLineas(merged);
    }).catch(() => { setLineas([...BASE_LINEAS]); });
  }

  useEffect(() => { cargarHistorial(); }, []);

  async function abrirAuditoria() {
    setMsg(null);
    setAbriendo(true);
    try {
      const { data } = await apiClient.post<Auditoria>("/api/v1/almacen/auditorias", {
        linea: lineaFiltro || undefined,
      });
      setAuditoriaActiva(data);
      setConteos({});
      cargarHistorial();
    } catch (err: any) {
      setMsg({ tipo: "error", texto: err.response?.data?.detail ?? "No se pudo abrir la auditoría." });
    } finally {
      setAbriendo(false);
    }
  }

  async function guardarConteo(item: AuditoriaItem) {
    const valor = conteos[item.id];
    if (valor === undefined || valor === "" || !auditoriaActiva) return;
    try {
      const { data } = await apiClient.put<AuditoriaItem>(
        `/api/v1/almacen/auditorias/${auditoriaActiva.id}/items/${item.id}`,
        { cantidad_fisica: Number(valor) }
      );
      setAuditoriaActiva((prev) => prev && {
        ...prev,
        items: prev.items.map((i) => (i.id === item.id ? data : i)),
      });
    } catch (err: any) {
      setMsg({ tipo: "error", texto: err.response?.data?.detail ?? "No se pudo guardar el conteo." });
    }
  }

  async function cerrarAuditoria() {
    if (!auditoriaActiva) return;
    if (!window.confirm("¿Cerrar esta auditoría y ajustar el inventario según lo contado? Esta acción no se puede deshacer.")) return;
    setCerrando(true);
    try {
      const { data } = await apiClient.post<Auditoria>(`/api/v1/almacen/auditorias/${auditoriaActiva.id}/cerrar`);
      setAuditoriaActiva(data);
      setMsg({ tipo: "ok", texto: "Auditoría cerrada. El inventario fue ajustado según el conteo físico." });
      cargarHistorial();
    } catch (err: any) {
      setMsg({ tipo: "error", texto: err.response?.data?.detail ?? "No se pudo cerrar la auditoría." });
    } finally {
      setCerrando(false);
    }
  }

  return (
    <div className="space-y-6">
      {msg && (
        <p className={`text-sm font-medium px-4 py-2 rounded-xl ${msg.tipo === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
          {msg.texto}
        </p>
      )}

      {!auditoriaActiva || auditoriaActiva.status === "cerrada" ? (
        <section className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4">
          <h3 className="text-lg font-bold text-slate-900">🔍 Iniciar Nueva Auditoría</h3>
          <p className="text-xs text-slate-400">Toma una foto del stock actual del sistema para compararla con el conteo físico real.</p>
          <div className="flex gap-3 items-end">
            <label className="flex-1 flex flex-col">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Línea / Departamento (opcional)</span>
              <select className={`${inputCls} mt-1`} value={lineaFiltro} onChange={(e) => setLineaFiltro(e.target.value)}>
                <option value="">Todos los productos</option>
                {lineas.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={abrirAuditoria}
              disabled={abriendo}
              className="bg-slate-950 hover:bg-blue-600 text-white rounded-xl px-5 py-2.5 text-sm font-bold transition-all disabled:opacity-50"
            >
              {abriendo ? "Abriendo..." : "Iniciar Auditoría"}
            </button>
          </div>
        </section>
      ) : (
        <section className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900">📋 Auditoría #{auditoriaActiva.id} en Progreso</h3>
              <p className="text-xs text-slate-400">Abierta el {new Date(auditoriaActiva.fecha).toLocaleDateString("es-VE")} · {auditoriaActiva.items.length} producto(s)</p>
            </div>
            <button
              type="button"
              onClick={cerrarAuditoria}
              disabled={cerrando}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-4 py-2 text-xs font-bold transition-all disabled:opacity-50"
            >
              {cerrando ? "Cerrando..." : "✓ Cerrar Auditoría y Ajustar Inventario"}
            </button>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left bg-slate-50/50">
                <th className="py-2 px-3 text-xs font-bold text-slate-400 uppercase">Producto</th>
                <th className="py-2 px-3 text-xs font-bold text-slate-400 uppercase">Sistema</th>
                <th className="py-2 px-3 text-xs font-bold text-slate-400 uppercase">Físico</th>
                <th className="py-2 px-3 text-xs font-bold text-slate-400 uppercase">Diferencia</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {auditoriaActiva.items.map((item) => (
                <tr key={item.id}>
                  <td className="py-2.5 px-3 font-medium text-slate-700">{item.producto_nombre}</td>
                  <td className="py-2.5 px-3 font-mono text-slate-500">{fmtKg(item.cantidad_sistema)}</td>
                  <td className="py-2.5 px-3">
                    <input
                      type="number"
                      step="0.001"
                      disabled={auditoriaActiva.status === "cerrada"}
                      value={conteos[item.id] ?? (item.cantidad_fisica !== null ? String(item.cantidad_fisica) : "")}
                      onChange={(e) => setConteos((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      className={`${inputCls} w-28 font-mono`}
                      placeholder="0.000"
                    />
                  </td>
                  <td className="py-2.5 px-3">
                    {item.diferencia !== null && (
                      <span className={`font-mono font-bold ${Number(item.diferencia) === 0 ? "text-slate-400" : Number(item.diferencia) > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {Number(item.diferencia) > 0 ? "+" : ""}{fmtKg(item.diferencia)}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    {auditoriaActiva.status === "abierta" && (
                      <button
                        type="button"
                        onClick={() => guardarConteo(item)}
                        className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg"
                      >
                        Guardar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 mb-3">📜 Historial de Auditorías</h3>
        {auditorias.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-6">Sin auditorías registradas todavía.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {auditorias.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => { setAuditoriaActiva(a); setConteos({}); }}
                className="w-full py-3 flex items-center justify-between text-sm hover:bg-slate-50/50 rounded-xl px-2 transition-all"
              >
                <span className="font-semibold text-slate-700">Auditoría #{a.id} · {new Date(a.fecha).toLocaleDateString("es-VE")}</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${a.status === "abierta" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                  {a.status}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
