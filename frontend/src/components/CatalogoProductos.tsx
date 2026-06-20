import { useState, useEffect } from "react";
import apiClient from "../api/client";

interface Producto {
  id: number;
  codigo_interno: string;
  codigo_barras: string | null;
  nombre: string;
  linea: string | null;
  precio_1_detalle: number;
  stock_total: number;
  proveedor: string | null;
  foto_url: string | null;
  stock_minimo: number;
}

export default function CatalogoProductos({ tasaBcv }: { tasaBcv: number }) {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [filtro, setFiltro] = useState("");
  const [categoriaSel, setCategoriaSel] = useState("Todos");
  const [soloStock, setSoloStock] = useState(true); // Default to true (restrict to stock only)

  async function cargarProductos() {
    setCargando(true);
    setError("");
    try {
      const res = await apiClient.get<Producto[]>("/api/v1/productos", {
        params: { solo_stock: soloStock }
      });
      setProductos(res.data);
    } catch (err: any) {
      console.error(err);
      setError("No se pudo conectar con el inventario del servidor.");
    } finally {
      setCargando(false);
    }
  }

  // Reload when stock filter changes
  useEffect(() => {
    cargarProductos();
  }, [soloStock]);

  // Extract unique categories (lineas) from products
  const categorias = ["Todos", ...new Set(productos.map(p => p.linea).filter(Boolean))] as string[];

  // Filter products by name/SKU and selected category in frontend
  const productosFiltrados = productos.filter((p) => {
    const matchesBusqueda =
      p.nombre.toLowerCase().includes(filtro.toLowerCase()) ||
      p.codigo_interno.toLowerCase().includes(filtro.toLowerCase()) ||
      (p.codigo_barras && p.codigo_barras.includes(filtro));
    const matchesCategoria =
      categoriaSel === "Todos" || p.linea === categoriaSel;
    return matchesBusqueda && matchesCategoria;
  });

  const fmt = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Fallback image for products without custom URL
  const defaultImage = "https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=60";

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Cabecera del Catálogo */}
      <div className="rounded-3xl bg-gradient-to-r from-[#0c1020] via-[#0e1428] to-[#080b16] p-6 text-white border border-white/5 shadow-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
        <div className="absolute right-0 top-0 text-9xl translate-x-12 translate-y-4 opacity-5 select-none pointer-events-none">🏢</div>
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white">Catálogo de Productos Maestro</h2>
          <p className="text-xs text-slate-400 font-semibold mt-1 uppercase tracking-wider">
            Inventario comercial en vivo · Tasa BCV: <span className="text-violet-400 font-mono">Bs. {fmt(tasaBcv)}</span>
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full md:w-auto z-10">
          {/* Stock toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none bg-white/5 border border-white/10 hover:bg-white/10 px-4 py-2 rounded-xl text-xs font-bold text-slate-300 transition-all duration-300">
            <input
              type="checkbox"
              checked={soloStock}
              onChange={(e) => setSoloStock(e.target.checked)}
              className="rounded text-violet-600 focus:ring-violet-500 h-4.5 w-4.5 border-white/10 bg-slate-900 focus:ring-offset-[#0c1020]"
            />
            <span>Solo con Stock Activo</span>
          </label>

          {/* Category tabs */}
          {categorias.length > 1 && (
            <div className="flex flex-wrap bg-white/5 p-1 rounded-xl border border-white/10 text-[10px] sm:text-xs font-bold max-h-24 overflow-y-auto scrollbar-none">
              {categorias.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoriaSel(cat)}
                  className={`px-3 py-1.5 rounded-lg transition-all duration-300 ${
                    categoriaSel === cat
                      ? "bg-violet-600 text-white shadow-md shadow-violet-500/20"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {cat || "General"}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100/80 shadow-md shadow-slate-100/40 flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full">
          <input
            type="text"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="🔍 Buscar por nombre, SKU o código de barras..."
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all text-slate-800"
          />
        </div>
        <button
          type="button"
          onClick={cargarProductos}
          disabled={cargando}
          className="w-full sm:w-auto shrink-0 bg-violet-50 hover:bg-violet-600 text-violet-600 hover:text-white rounded-xl px-5 py-3 text-xs font-bold transition-all duration-300 border border-violet-100 hover:border-violet-600 active:scale-95 shadow-sm"
        >
          {cargando ? "Sincronizando..." : "🔄 Sincronizar"}
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-bold animate-bounce">
          {error}
        </div>
      )}

      {/* Grid of cards */}
      {cargando && productos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-3">
          <div className="w-10 h-10 border-4 border-violet-650 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-slate-400 font-semibold text-xs uppercase tracking-wider animate-pulse">Conectando con el inventario...</span>
        </div>
      ) : productosFiltrados.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-100/85 rounded-3xl p-8 shadow-sm">
          <span className="text-4xl block">📦</span>
          <h4 className="font-bold text-slate-700 mt-3">No hay productos que coincidan</h4>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto font-medium">
            {soloStock
              ? "Prueba desactivando la casilla 'Solo con Stock Activo' para visualizar productos sin stock."
              : "Verifique los filtros de búsqueda o registre productos en la Consola."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
          {productosFiltrados.map((p) => {
            const esBajoStock = p.stock_total <= p.stock_minimo;
            const tieneStock = p.stock_total > 0;
            return (
              <div
                key={p.id}
                className="rounded-3xl border border-slate-150/60 bg-white overflow-hidden shadow-sm flex flex-col justify-between hover:shadow-xl hover:border-slate-200/60 transition-all duration-300 relative group"
              >
                {/* Stock badge */}
                <span
                  className={`absolute left-3 top-3 z-10 px-2.5 py-1 rounded-xl text-[9px] font-black uppercase text-white shadow-md border tracking-wider ${
                    !tieneStock
                      ? "bg-rose-500 border-rose-400"
                      : esBajoStock
                      ? "bg-amber-500 border-amber-400 animate-pulse"
                      : "bg-slate-900/90 border-white/10"
                  }`}
                >
                  {!tieneStock
                    ? "Sin Stock"
                    : esBajoStock
                    ? `Crítico: ${fmt(p.stock_total)}`
                    : `Stock: ${fmt(p.stock_total)}`}
                </span>

                {/* Photo container */}
                <div className="h-44 w-full bg-slate-50 relative overflow-hidden">
                  <img
                    src={p.foto_url || defaultImage}
                    alt={p.nombre}
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = defaultImage;
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/20 to-transparent" />
                </div>

                {/* Details */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-1">
                    <span className="text-[9px] font-black uppercase tracking-wider text-violet-650">
                      {p.linea || "General"}
                    </span>
                    <h4 className="text-sm font-bold text-slate-800 leading-snug line-clamp-2 h-10 group-hover:text-slate-955 transition-colors">
                      {p.nombre}
                    </h4>
                    <p className="text-[9px] font-mono text-slate-400 font-medium">
                      SKU: {p.codigo_interno} {p.codigo_barras ? `· GTIN: ${p.codigo_barras}` : ""}
                    </p>
                  </div>

                  {/* Multi-currency pricing matrix */}
                  <div className="bg-slate-50/50 hover:bg-slate-50 p-3 rounded-2xl border border-slate-100/60 flex justify-between items-center font-mono relative overflow-hidden transition-all duration-300">
                    <div>
                      <p className="text-[9px] font-bold uppercase text-slate-400 leading-none">Divisas</p>
                      <p className="text-base font-black text-slate-800 mt-1">${fmt(Number(p.precio_1_detalle))}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-bold uppercase text-slate-400 leading-none">Bolívares</p>
                      <p className="text-xs font-black text-emerald-600 mt-1">Bs. {fmt(Number(p.precio_1_detalle) * tasaBcv)}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}