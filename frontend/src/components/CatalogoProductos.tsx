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
  marca?: string | null;
  ubicacion?: string | null;
  numero_lote?: string | null;
  fecha_ingreso_stock?: string | null;
  fecha_vencimiento?: string | null;
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
            
            const isExpiringSoon = () => {
              if (!p.fecha_vencimiento) return false;
              const today = new Date();
              const expDate = new Date(p.fecha_vencimiento);
              const diffTime = expDate.getTime() - today.getTime();
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              return diffDays <= 15 && diffDays >= 0;
            };
            
            const isExpired = () => {
              if (!p.fecha_vencimiento) return false;
              return new Date(p.fecha_vencimiento) < new Date();
            };

            const alertVencimiento = isExpired() 
              ? { class: "bg-red-100 text-red-700 border-red-200", text: "Vencido" }
              : isExpiringSoon() 
                ? { class: "bg-orange-100 text-orange-700 border-orange-200", text: "Por Vencer" }
                : null;

            return (
              <div
                key={p.id}
                className="group relative flex flex-col w-full rounded-[24px] bg-white border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden font-sans"
              >
                {/* Badge de Stock Flotante */}
                <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-2">
                  <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full shadow-sm backdrop-blur-md bg-white/90 border ${tieneStock ? (esBajoStock ? 'text-amber-600 border-amber-200 animate-pulse' : 'text-emerald-600 border-emerald-100') : 'text-rose-500 border-rose-100'}`}>
                    {!tieneStock ? "Agotado" : esBajoStock ? `Crítico: ${fmt(p.stock_total)}` : `${fmt(p.stock_total)} Disp.`}
                  </span>
                  
                  {/* Alerta de Lote (Vencimiento) */}
                  {alertVencimiento && (
                    <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-full shadow-sm border ${alertVencimiento.class} flex items-center gap-1`}>
                      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      {alertVencimiento.text}
                    </span>
                  )}
                </div>

                {/* Imagen del Producto */}
                <div className="relative h-44 w-full bg-slate-50 flex items-center justify-center overflow-hidden">
                  <img
                    src={p.foto_url || defaultImage}
                    alt={p.nombre}
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = defaultImage;
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/10 to-transparent" />
                </div>

                {/* Cuerpo de la Tarjeta */}
                <div className="flex flex-col flex-grow p-4 space-y-3">
                  {/* Categoría, Nombre, Marca y Proveedor */}
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-wider text-violet-650">
                      {p.linea || "General"}
                    </span>
                    <h3 className="text-sm font-bold text-slate-800 leading-snug line-clamp-2 h-10 group-hover:text-slate-955 transition-colors mt-1">
                      {p.nombre}
                    </h3>
                    <div className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 truncate">
                      {p.marca && (
                        <span className="flex items-center gap-1">
                          <span className="w-1 h-1 rounded-full bg-blue-400"></span>
                          {p.marca}
                        </span>
                      )}
                      {p.marca && p.proveedor && <span>•</span>}
                      {p.proveedor && (
                        <span className="text-slate-500 truncate">{p.proveedor}</span>
                      )}
                    </div>
                  </div>

                  {/* Detalles de Logística (Lote, Fechas, Ubicación) */}
                  <div className="grid grid-cols-2 gap-2 p-2.5 bg-slate-50/80 rounded-xl border border-slate-100 text-[10px] font-medium text-slate-500">
                    {p.ubicacion && (
                      <div className="col-span-2 flex items-center gap-1 pb-1.5 border-b border-slate-200">
                        <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Ubicación: <span className="font-bold text-slate-700 truncate">{p.ubicacion}</span>
                      </div>
                    )}
                    
                    <div className="flex flex-col mt-1">
                      <span className="text-slate-400 uppercase text-[8px] tracking-wider font-bold">Lote / Ingreso</span>
                      <span className="text-slate-700 truncate">{p.numero_lote || 'N/A'}</span>
                      <span className="text-slate-400">{p.fecha_ingreso_stock || '--'}</span>
                    </div>
                    
                    <div className="flex flex-col mt-1">
                      <span className="text-slate-400 uppercase text-[8px] tracking-wider font-bold">Vencimiento</span>
                      <span className={`font-bold ${isExpired() ? 'text-red-600' : isExpiringSoon() ? 'text-orange-600' : 'text-slate-700'}`}>
                        {p.fecha_vencimiento || 'No perecedero'}
                      </span>
                    </div>
                  </div>

                  <div className="flex-grow"></div>

                  {/* Multi-currency pricing matrix */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Precio Total</span>
                      <div className="flex items-baseline gap-0.5">
                        <span className="text-xs font-bold text-emerald-600">$</span>
                        <span className="text-lg font-black text-slate-800 tracking-tight">
                          {fmt(Number(p.precio_1_detalle))}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-end text-right">
                      <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Equivalente</span>
                      <div className="px-2 py-0.5 bg-blue-50 rounded-md border border-blue-100 mt-0.5">
                        <span className="text-xs font-black text-blue-700">
                          Bs. {fmt(Number(p.precio_1_detalle) * tasaBcv)}
                        </span>
                      </div>
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