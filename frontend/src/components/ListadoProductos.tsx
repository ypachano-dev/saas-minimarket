import { useState, useEffect } from "react";
import apiClient from "../api/client";
import Modal from "./Modal";
import FichaProducto from "./FichaProducto";

interface Producto {
  id: number;
  codigo_interno: string;
  codigo_barras?: string | null;
  nombre: string;
  marca?: string | null;
  linea?: string | null;
  clase_o_tipo?: string | null;
  tipo_envase?: string | null;
  peso?: string | number | null;
  ubicacion?: string | null;
  tipo_venta: string;
  factor_merma?: string | number | null;
  refrigerado: boolean;
  temperatura_conservacion?: string | null;
  perecedero: boolean;
  caracteristicas?: string | null;
  fecha_elaboracion?: string | null;
  fecha_ingreso_stock?: string | null;
  fecha_vencimiento?: string | null;
  costo_usd: string | number;
  precio_1_detalle: string | number;
  precio_2_mayorista: string | number;
  precio_3_especial: string | number;
  stock_minimo: string | number;
  aplica_iva: boolean;
  foto_url?: string | null;
  stock_total?: number;
  status: boolean;
}

export default function ListadoProductos() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(false);
  const [productoEditar, setProductoEditar] = useState<Producto | null>(null);

  const cargarProductos = async () => {
    setCargando(true);
    try {
      const res = await apiClient.get<Producto[]>("/api/v1/productos", { params: { limit: 500 } });
      setProductos(res.data);
    } catch {
      setProductos([]);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarProductos();
  }, []);

  const productosFiltrados = productos.filter((p) =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.codigo_interno.toLowerCase().includes(busqueda.toLowerCase()) ||
    (p.codigo_barras || "").toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div className="rounded-3xl bg-white border border-slate-100 shadow-sm overflow-hidden p-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <h4 className="text-sm font-black text-slate-950 uppercase tracking-wider">Productos Registrados</h4>
        <input
          type="text"
          className="w-full md:w-64 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/50"
          placeholder="Buscar por código o nombre..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold uppercase text-slate-400">
              <th className="px-3 py-3">Producto</th>
              <th className="px-3 py-3">Stock</th>
              <th className="px-3 py-3 text-right">Precio 1</th>
              <th className="px-3 py-3 text-center">Estado</th>
              <th className="px-3 py-3">Editar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
            {productosFiltrados.map((p) => (
              <tr key={p.id} className={`hover:bg-slate-50/40 ${!p.status ? "opacity-50" : ""}`}>
                <td className="px-3 py-2.5 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-100 overflow-hidden flex items-center justify-center flex-shrink-0">
                    {p.foto_url ? <img src={p.foto_url} alt={p.nombre} className="w-full h-full object-contain" /> : <span className="text-sm">📦</span>}
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">{p.nombre}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{p.codigo_interno}{p.marca ? ` · ${p.marca}` : ""}</p>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-xs font-bold">{p.stock_total !== undefined ? Number(p.stock_total).toFixed(2) : "-"}</td>
                <td className="px-3 py-2.5 text-right font-mono text-xs font-bold">${Number(p.precio_1_detalle).toFixed(2)}</td>
                <td className="px-3 py-2.5 text-center">
                  <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full ${p.status ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
                    {p.status ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => setProductoEditar(p)}
                    title="Editar ficha completa"
                    className="text-slate-400 hover:text-blue-600 text-base"
                  >
                    ✏️
                  </button>
                </td>
              </tr>
            ))}
            {!cargando && productosFiltrados.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-6 text-slate-400 font-medium">No hay productos registrados.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {productoEditar && (
        <Modal titulo="Editar Producto" onCerrar={() => setProductoEditar(null)}>
          <FichaProducto
            productoEditar={productoEditar}
            onCancelar={() => setProductoEditar(null)}
            onGuardado={() => { setProductoEditar(null); cargarProductos(); }}
          />
        </Modal>
      )}
    </div>
  );
}
