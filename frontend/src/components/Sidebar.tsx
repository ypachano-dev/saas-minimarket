export type ViewKey =
  | "dashboard" | "ingreso" | "pos" | "pedidos" | "delivery"
  | "crm" | "estadisticas" | "almacen" | "tesoreria" | "ficha" | "consola" | "cuentas" | "balanza"
  | "visitas" | "rutas";

export interface ModuloDef {
  key: ViewKey;
  icon: string;
  label: string;
  pendientes?: string[];
}

export const MODULOS: ModuloDef[] = [
  { key: "dashboard", icon: "📊", label: "Dashboard Maestro" },
  { key: "ingreso", icon: "📥", label: "Ingreso de Datos", pendientes: ["Clientes", "Productos", "Empleados", "Usuarios", "Vehículos Delivery", "Proveedores"] },
  { key: "visitas", icon: "🚗", label: "Visita Clientes (RTC)", pendientes: ["Historial de cliente", "Toma de presupuesto", "Encuesta de marketing", "GPS y foto de fachada"] },
  { key: "rutas", icon: "🗺️", label: "Agenda y Viáticos", pendientes: ["Planificación semanal", "Solicitud de viáticos", "Aprobación de gerente", "Seguimiento GPS en tiempo real"] },
  { key: "balanza", icon: "⚖️", label: "Balanza Digital", pendientes: ["Pesaje carnicería", "Pesaje verdulería", "Pesaje charcutería"] },
  { key: "pos", icon: "🛒", label: "Caja / POS", pendientes: ["Punto de venta", "Caja chica", "Lector de código de barras"] },
  { key: "pedidos", icon: "📦", label: "Pedidos y Compras", pendientes: ["Gestión de órdenes", "Cálculo automático de compras según stock"] },
  { key: "delivery", icon: "🚚", label: "Delivery Exprés" },
  { key: "crm", icon: "🤝", label: "Módulo CRM (ALO)" },
  { key: "estadisticas", icon: "📈", label: "Estadísticas Avanzadas (VALE)" },
  { key: "almacen", icon: "🏢", label: "Gestión Almacén" },
  { key: "cuentas", icon: "💸", label: "Cartera y Créditos (YHORGE)" },
  { key: "tesoreria", icon: "🏦", label: "Bancos y Tesorería" },
  { key: "ficha", icon: "🗂️", label: "Ficha de Catálogo", pendientes: ["Foto", "Nombre", "Descripción", "Marca", "Proveedor", "Código de barra", "Peso", "Presentación", "Fecha de vencimiento (FV)", "Fecha de elaboración", "Fecha de ingreso", "Tipo", "Ubicación"] },
  { key: "consola", icon: "⚙️", label: "Consola SaaS Maestro" },
];

export default function Sidebar({
  view,
  setView,
  onLogout,
  rol,
  tipoNegocio,
  nombreEmpresa,
  modulosHabilitados
}: {
  view: ViewKey;
  setView: (v: ViewKey) => void;
  onLogout: () => void;
  rol?: string | null;
  tipoNegocio?: string | null;
  nombreEmpresa?: string | null;
  modulosHabilitados?: string[];
}) {
  const modulos = MODULOS.filter((m) => {
    if (m.key === "consola") return rol === "propietario";
    if (rol === "repartidor") return m.key === "delivery";
    
    // Si el usuario es un vendedor RTC, solo ve Dashboard, Visita Clientes, Rutas y Ficha Catálogo
    if (rol === "vendedor") {
      const allowedVendedor = ["dashboard", "visitas", "rutas", "ficha"];
      if (!allowedVendedor.includes(m.key)) return false;
    }
    
    // Filtro dinámico por feature flags provistos por el Backend para el inquilino
    if (modulosHabilitados && !modulosHabilitados.includes(m.key)) {
      return false;
    }
    return true;
  });

  return (
    <aside className="w-64 bg-gradient-to-b from-[#0c1020] via-[#0e1428] to-[#080b16] text-slate-400 p-5 flex flex-col justify-between h-full border-r border-white/5 shadow-2xl">
      <div className="flex flex-col overflow-hidden h-full">
        {/* Brand Header */}
        <div className="px-3 py-4 mb-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-gradient flex items-center justify-center shadow-lg shadow-brand-primary/25 relative overflow-hidden">
            <span className="text-white font-extrabold text-sm relative z-10">
              {(nombreEmpresa || "M").substring(0, 1).toUpperCase()}
            </span>
            <div className="absolute inset-0 bg-white/20 blur-[2px] transform rotate-45 translate-y-3"></div>
          </div>
          <div>
            <h1 className="text-md font-bold tracking-tight text-white leading-none truncate w-36">
              {nombreEmpresa || "MiniMarket SaaS"}
            </h1>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-primary mt-1">
              {tipoNegocio === "agroferreteria" ? "Agroferretería Suite" : "MiniMarket Suite"}
            </p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex flex-col gap-1 overflow-y-auto pr-1 flex-1 scrollbar-thin scrollbar-thumb-white/10">
          {modulos.map((m) => {
            const isActive = view === m.key;
            return (
              <button
                key={m.key}
                onClick={() => setView(m.key)}
                className={`group flex items-center gap-3 rounded-xl px-3.5 py-3 text-xs font-medium text-left transition-all duration-300 transform hover:translate-x-1 ${
                  isActive
                    ? "bg-brand-menu-active text-white border-l-[3px] border-brand-primary shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] glow-brand"
                    : "hover:bg-white/5 hover:text-slate-200 border-l-[3px] border-transparent"
                }`}
              >
                <span className={`text-base transition-transform duration-300 group-hover:scale-110 ${isActive ? "opacity-100" : "opacity-70 group-hover:opacity-100"}`}>
                  {m.icon}
                </span>
                <span className="truncate">{m.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer / User Profile */}
      <div className="mt-4 pt-4 border-t border-white/5 flex flex-col gap-2">
        <div className="flex items-center gap-3 px-3 py-2 bg-white/5 rounded-xl border border-white/5">
          <div className="w-8 h-8 rounded-full bg-brand-primary-20 flex items-center justify-center font-bold text-brand-primary text-xs">
            {rol ? rol.substring(0, 2).toUpperCase() : "US"}
          </div>
          <div className="overflow-hidden">
            <p className="text-xs font-medium text-slate-300 capitalize truncate">{rol || "Usuario"}</p>
            <p className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">Rol Actual</p>
          </div>
        </div>
        
        <button
          onClick={onLogout}
          className="flex items-center justify-center gap-2 w-full rounded-xl px-3.5 py-2.5 text-xs font-semibold text-rose-400 bg-rose-500/5 hover:bg-rose-500/15 border border-rose-500/10 hover:border-rose-500/20 transition-all duration-300"
        >
          <span className="text-sm">⎋</span>
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}