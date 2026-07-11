import { APP_NAME, FIRMA_PROVEEDOR } from "../config/brand";
import { useOfflineSync } from "../hooks/useOfflineSync";

export type ViewKey =
  | "dashboard" | "ingreso" | "pos" | "pedidos" | "delivery"
  | "crm" | "estadisticas" | "almacen" | "tesoreria" | "ficha" | "consola" | "cuentas" | "balanza"
  | "visitas" | "rutas" | "configuracion" | "facturacion";

export interface ModuloDef {
  key: ViewKey;
  icon: string;
  label: string;
  category: "erp" | "crm" | "ias" | "sistema";
  pendientes?: string[];
}

export const MODULOS: ModuloDef[] = [
  // ERP
  { key: "dashboard", icon: "📊", label: "Dashboard Maestro", category: "erp" },
  { key: "ingreso", icon: "📥", label: "Ingreso de Datos", category: "erp", pendientes: ["Clientes", "Productos", "Empleados", "Usuarios", "Vehículos Delivery", "Proveedores"] },
  { key: "balanza", icon: "⚖️", label: "Balanza Digital", category: "erp", pendientes: ["Pesaje carnicería", "Pesaje verdulería", "Pesaje charcutería"] },
  { key: "pos", icon: "🛒", label: "Caja / POS", category: "erp", pendientes: ["Punto de venta", "Caja chica", "Lector de código de barras"] },
  { key: "almacen", icon: "🏢", label: "Gestión Almacén", category: "erp" },
  { key: "pedidos", icon: "📦", label: "Pedidos y Compras", category: "erp", pendientes: ["Gestión de órdenes", "Cálculo automático de compras según stock"] },
  { key: "delivery", icon: "🚚", label: "Delivery Exprés", category: "erp" },
  { key: "tesoreria", icon: "🏦", label: "Bancos y Tesorería", category: "erp" },
  { key: "ficha", icon: "🗂️", label: "Ficha de Catálogo", category: "erp", pendientes: ["Foto", "Nombre", "Descripción", "Marca", "Proveedor", "Código de barra", "Peso", "Presentación", "Fecha de vencimiento (FV)", "Fecha de elaboración", "Fecha de ingreso", "Tipo", "Ubicación"] },
  { key: "facturacion", icon: "🧾", label: "Facturación SENIAT", category: "erp" },

  // CRM
  { key: "visitas", icon: "🚗", label: "Visita Clientes", category: "crm", pendientes: ["Historial de cliente", "Toma de presupuesto", "Encuesta de marketing", "GPS y foto de fachada"] },
  { key: "rutas", icon: "🗺️", label: "Agenda y Viáticos", category: "crm", pendientes: ["Planificación semanal", "Solicitud de viáticos", "Aprobación de gerente", "Seguimiento GPS en tiempo real"] },

  // IAs
  { key: "crm", icon: "🤝", label: "Módulo CRM (ALO)", category: "ias" },
  { key: "estadisticas", icon: "📈", label: "Estadísticas Avanzadas (VALE)", category: "ias" },
  { key: "cuentas", icon: "💸", label: "Cartera y Créditos (YHORGE)", category: "ias" },

  // Sistema
  { key: "configuracion", icon: "🧾", label: "Configuración de Tienda", category: "sistema" },
  { key: "consola", icon: "⚙️", label: "Consola SaaS Maestro", category: "sistema" },
];

// Los 5 módulos que aparecen en la barra inferior de móvil
export const BOTTOM_NAV_KEYS: ViewKey[] = ["dashboard", "pos", "ficha", "balanza", "almacen"];

const TAGLINE_POR_TIPO_NEGOCIO: Record<string, string> = {
  minimarket:    "3Q Nexus · MiniMarket",
  carniceria:    "3Q Nexus · Carnicería",
  ferreteria:    "3Q Nexus · Ferretería",
  agroferreteria:"3Q Nexus · AgroFerretería",
  agropecuaria:  "3Q Nexus · Agropecuaria",
  // Legacy fallbacks
  ferreagropecuaria: "3Q Nexus · AgroFerretería",
};

export default function Sidebar({
  view,
  setView,
  onLogout,
  onClose,
  rol,
  tipoNegocio,
  nombreEmpresa,
  nombreCorto,
  logoUrl,
  modulosHabilitados,
  isDrawer = false,
}: {
  view: ViewKey;
  setView: (v: ViewKey) => void;
  onLogout: () => void;
  onClose?: () => void;
  rol?: string | null;
  tipoNegocio?: string | null;
  nombreEmpresa?: string | null;
  nombreCorto?: string | null;
  logoUrl?: string | null;
  modulosHabilitados?: string[];
  isDrawer?: boolean;
}) {
  const { isOnline, queueLength, isSyncing, sincronizarCola } = useOfflineSync();
  const modulos = MODULOS.filter((m) => {
    if (m.key === "consola") return rol === "propietario";
    if (m.key === "configuracion") return rol === "admin" || rol === "propietario";
    if (rol === "repartidor") return m.key === "delivery";
    if (rol === "vendedor") {
      const allowedVendedor = ["dashboard", "visitas", "rutas", "ficha"];
      if (!allowedVendedor.includes(m.key)) return false;
    }
    if (modulosHabilitados && !modulosHabilitados.includes(m.key)) return false;
    return true;
  });

  const handleNav = (key: ViewKey) => {
    setView(key);
    onClose?.();
  };

  return (
    <aside className="w-64 bg-gradient-to-b from-[#0c1020] via-[#0e1428] to-[#080b16] text-slate-400 p-5 flex flex-col justify-between h-full border-r border-white/5 shadow-2xl">
      <div className="flex flex-col overflow-hidden h-full">
        {/* Brand Header */}
        <div className="px-3 py-4 mb-4 flex items-center gap-3">
          {isDrawer && (
            <button
              type="button"
              onClick={onClose}
              className="mr-1 text-slate-400 hover:text-white transition-colors"
              aria-label="Cerrar menú"
            >
              ✕
            </button>
          )}
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={nombreCorto || nombreEmpresa || APP_NAME}
              className="w-9 h-9 rounded-xl object-cover shadow-lg shadow-brand-primary/25"
            />
          ) : (
            <div className="w-9 h-9 rounded-xl bg-brand-gradient flex items-center justify-center shadow-lg shadow-brand-primary/25 relative overflow-hidden">
              <span className="text-white font-extrabold text-sm relative z-10">
                {(nombreCorto || nombreEmpresa || APP_NAME).substring(0, 1).toUpperCase()}
              </span>
              <div className="absolute inset-0 bg-white/20 blur-[2px] transform rotate-45 translate-y-3"></div>
            </div>
          )}
          <div>
            <h1 className="text-md font-bold tracking-tight text-white leading-none truncate w-36">
              {nombreCorto || nombreEmpresa || APP_NAME}
            </h1>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-primary mt-1">
              {(tipoNegocio && TAGLINE_POR_TIPO_NEGOCIO[tipoNegocio]) || "3Q Nexus"}
            </p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex flex-col gap-4 overflow-y-auto pr-1 flex-1 scrollbar-thin scrollbar-thumb-white/10">
          {[
            { id: "erp", label: "Sistema ERP" },
            { id: "crm", label: "Módulos CRM" },
            { id: "ias", label: "Asistentes de IA" },
            { id: "sistema", label: "Configuración y Soporte" }
          ].map((cat) => {
            const catModulos = modulos.filter((m) => m.category === cat.id);
            if (catModulos.length === 0) return null;
            return (
              <div key={cat.id} className="flex flex-col gap-1">
                <span className="px-3.5 text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  {cat.label}
                </span>
                {catModulos.map((m) => {
                  const isActive = view === m.key;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => handleNav(m.key)}
                      className={`group flex items-center gap-3 rounded-xl px-3.5 py-2 text-xs font-medium text-left transition-all duration-300 transform hover:translate-x-1 ${
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
              </div>
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

        {/* Indicador de Conectividad Premium (Offline-First) */}
        <div className="flex flex-col gap-1.5 px-3 py-2 bg-slate-900/40 rounded-xl border border-white/5 text-[10px]">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Conectividad</span>
            {isOnline ? (
              <span className="flex items-center gap-1 font-semibold text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                En línea
              </span>
            ) : (
              <span className="flex items-center gap-1 font-semibold text-rose-400">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                Modo local
              </span>
            )}
          </div>
          {queueLength > 0 && (
            <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-white/5">
              <span className="text-amber-400 font-semibold">{queueLength} pendientes</span>
              <button
                type="button"
                onClick={sincronizarCola}
                disabled={isSyncing || !isOnline}
                className={`px-2 py-0.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-bold border border-amber-500/25 transition-all text-[9px] cursor-pointer ${
                  (isSyncing || !isOnline) ? "opacity-40 cursor-not-allowed" : ""
                }`}
              >
                {isSyncing ? "Sincronizando..." : "Sincronizar"}
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="flex items-center justify-center gap-2 w-full rounded-xl px-3.5 py-2.5 text-xs font-semibold text-rose-400 bg-rose-500/5 hover:bg-rose-500/15 border border-rose-500/10 hover:border-rose-500/20 transition-all duration-300"
        >
          <span className="text-sm">⎋</span>
          Cerrar sesión
        </button>

        <p className="text-center text-[9px] font-medium text-slate-600 tracking-wide pt-1">
          {FIRMA_PROVEEDOR}
        </p>
      </div>
    </aside>
  );
}
