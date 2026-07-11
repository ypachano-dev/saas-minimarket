import { useState, useEffect } from "react";
import Sidebar, { MODULOS, BOTTOM_NAV_KEYS, type ViewKey } from "./components/Sidebar";
import PlaceholderModulo from "./components/PlaceholderModulo";
import IngresoDatos from "./components/IngresoDatos";
import ModuloCRM from "./components/ModuloCRM";
import CatalogoProductos from "./components/CatalogoProductos";
import ModuloCaja from "./components/ModuloCaja";
import ModuloEmpresas from "./components/ModuloEmpresas";
import Login from "./components/Login";
import DashboardMaestro from "./components/DashboardMaestro";
import ModuloAlmacen from "./components/ModuloAlmacen";
import MapaDelivery from "./components/MapaDelivery";
import ModuloRepartidor from "./components/ModuloRepartidor";
import BannerVencimiento from "./components/BannerVencimiento";
import ReportePagoCliente from "./components/ReportePagoCliente";
import ModuloPedidos from "./components/ModuloPedidos";
import ModuloBalanza from "./components/ModuloBalanza";
import ModuloTesoreria from "./components/ModuloTesoreria";
import ModuloCartera from "./components/ModuloCartera";
import ModuloEstadisticas from "./components/ModuloEstadisticas";
import ModuloVisitas from "./components/ModuloVisitas";
import ModuloRutas from "./components/ModuloRutas";
import ConfiguracionTienda from "./components/ConfiguracionTienda";
import ModuloFacturacion from "./components/ModuloFacturacion";
import apiClient from "./api/client";
import { FIRMA_PROVEEDOR } from "./config/brand";
import { useAuthorization } from "./hooks/useAuthorization";


export default function App() {
  const [tasaBcv, setTasaBcv] = useState(602.33);
  const [autenticado, setAutenticado] = useState(!!localStorage.getItem("access_token"));
  const [view, setView] = useState<ViewKey>("dashboard");
  const [mostrarReporte, setMostrarReporte] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Hook centralizado de autorización: branding, módulos, IAs y roles
  const auth = useAuthorization(autenticado);
  const { empresaConfig, rol, cargando: inicializando, hasModule, hasRole } = auth;

  // Route Guard: verificar si el módulo actual está habilitado para este inquilino y rol
  const esModuloValido = (() => {
    if (view === "dashboard") return true;
    if (view === "consola") return hasRole("propietario");
    if (view === "configuracion") return hasRole("admin", "propietario");
    if (rol === "repartidor") return view === "delivery";
    if (rol === "vendedor") {
      const allowedVendedorKeys = ["dashboard", "visitas", "rutas", "ficha"];
      if (!allowedVendedorKeys.includes(view)) return false;
    }
    return hasModule(view);
  })();


  useEffect(() => {
    if (autenticado) {
      apiClient.get("/api/v1/tasa")
        .then((res) => {
          if (res.data && res.data.valor_bcv) {
            setTasaBcv(Number(res.data.valor_bcv));
          }
        })
        .catch(() => {});
    }
  }, [autenticado]);

  // Si la vista actual no es válida para el inquilino o rol, hacemos un fallback seguro a "dashboard"
  useEffect(() => {
    if (!inicializando && !esModuloValido) {
      setView("dashboard");
    }
  }, [view, inicializando, esModuloValido]);

  if (!autenticado) {
    return <Login onLogin={() => setAutenticado(true)} />;
  }

  if (autenticado && inicializando) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#080b16] text-white select-none">
        <div className="flex flex-col items-center space-y-6">
          <div className="relative flex h-16 w-16 items-center justify-center">
            <div className="absolute h-full w-full rounded-full border-4 border-slate-800"></div>
            <div className="absolute h-full w-full rounded-full border-4 border-t-brand-primary border-r-brand-primary animate-spin shadow-[0_0_15px_rgba(var(--color-primary-rgb),0.5)]"></div>
          </div>
          <div className="text-center space-y-2">
            <h3 className="text-sm font-bold tracking-widest text-slate-200 uppercase animate-pulse">
              Cargando Espacio de Trabajo
            </h3>
            <p className="text-[11px] text-slate-500 font-medium">
              Verificando credenciales y módulos de la empresa...
            </p>
          </div>
          <p className="text-[10px] text-slate-600 tracking-wide">{FIRMA_PROVEEDOR}</p>
        </div>
      </div>
    );
  }

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    setAutenticado(false);
  };

  const modulo = MODULOS.find((m) => m.key === view) ?? MODULOS[0];

  // Módulos disponibles para la barra inferior (filtrados por rol y habilitados)
  const modulos_habilitados = empresaConfig?.modulos_habilitados ?? [];
  const bottomNavModulos = MODULOS.filter((m) => {
    if (!BOTTOM_NAV_KEYS.includes(m.key)) return false;
    if (rol === "repartidor") return m.key === "delivery";
    if (rol === "vendedor") return ["dashboard", "ficha"].includes(m.key);
    if (modulos_habilitados.length && !modulos_habilitados.includes(m.key)) return false;
    return true;
  });

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <BannerVencimiento onReportar={() => setMostrarReporte(true)} />

      {/* ── Header móvil (visible solo en < lg) ── */}
      <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-[#0e1428] border-b border-white/5 flex-shrink-0">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="text-slate-300 hover:text-white text-xl p-1"
          aria-label="Abrir menú"
        >
          ☰
        </button>
        <div className="flex items-center gap-2">
          {empresaConfig?.logo_url ? (
            <img src={empresaConfig.logo_url} alt="" className="w-7 h-7 rounded-lg object-cover" />
          ) : (
            <div className="w-7 h-7 rounded-lg bg-brand-gradient flex items-center justify-center">
              <span className="text-white font-bold text-xs">
                {(empresaConfig?.nombre_corto || empresaConfig?.nombre_comercial || "M").substring(0, 1).toUpperCase()}
              </span>
            </div>
          )}
          <span className="text-white font-bold text-sm truncate max-w-[160px]">
            {empresaConfig?.nombre_corto || empresaConfig?.nombre_comercial || "3Q Nexus"}
          </span>
        </div>
        <div className="w-8" />
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar desktop (lg+) ── */}
        <div className="hidden lg:flex h-full flex-shrink-0">
          <Sidebar
            view={view}
            setView={setView}
            onLogout={handleLogout}
            rol={rol}
            tipoNegocio={empresaConfig?.tipo_negocio}
            nombreEmpresa={empresaConfig?.nombre_comercial}
            nombreCorto={empresaConfig?.nombre_corto}
            logoUrl={empresaConfig?.logo_url}
            modulosHabilitados={empresaConfig?.modulos_habilitados}
          />
        </div>

        {/* ── Drawer móvil / tablet (< lg) ── */}
        {drawerOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            {/* Overlay */}
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setDrawerOpen(false)}
            />
            {/* Panel */}
            <div className="relative z-10 h-full flex-shrink-0 animate-[slideInLeft_200ms_ease-out]">
              <Sidebar
                view={view}
                setView={setView}
                onLogout={handleLogout}
                onClose={() => setDrawerOpen(false)}
                rol={rol}
                tipoNegocio={empresaConfig?.tipo_negocio}
                nombreEmpresa={empresaConfig?.nombre_comercial}
                nombreCorto={empresaConfig?.nombre_corto}
                logoUrl={empresaConfig?.logo_url}
                modulosHabilitados={empresaConfig?.modulos_habilitados}
                isDrawer
              />
            </div>
          </div>
        )}

        {/* ── Contenido principal ── */}
        <main className="flex-1 overflow-y-auto pb-20 lg:pb-0">
          {view === "dashboard" && <DashboardMaestro tipoNegocio={empresaConfig?.tipo_negocio} rol={rol} />}
          {view === "delivery" && (rol === "repartidor" ? <ModuloRepartidor /> : <MapaDelivery />)}
          {view === "almacen" && <ModuloAlmacen tasaBcv={tasaBcv} />}
          {view === "ingreso" && (
            <div className="p-4 md:p-6">
              <IngresoDatos />
            </div>
          )}
          {view === "crm" && <ModuloCRM />}
          {view === "ficha" && <CatalogoProductos tasaBcv={tasaBcv} />}
          {view === "pos" && <ModuloCaja />}
          {view === "consola" && <ModuloEmpresas />}
          {view === "pedidos" && <ModuloPedidos />}
          {view === "balanza" && <ModuloBalanza />}
          {view === "tesoreria" && <ModuloTesoreria />}
          {view === "cuentas" && <ModuloCartera />}
          {view === "estadisticas" && <ModuloEstadisticas />}
          {view === "visitas" && <ModuloVisitas />}
          {view === "rutas" && <ModuloRutas rol={rol} />}
          {view === "configuracion" && <ConfiguracionTienda />}
          {view === "facturacion" && <ModuloFacturacion />}

          {!["dashboard", "delivery", "almacen", "ingreso", "crm", "ficha", "pos", "consola", "pedidos", "balanza", "tesoreria", "cuentas", "estadisticas", "visitas", "rutas", "configuracion", "facturacion"].includes(view) && (
            <div className="p-4 md:p-6">
              <PlaceholderModulo titulo={modulo.label} pendientes={modulo.pendientes ?? []} />
            </div>
          )}
        </main>
      </div>

      {/* ── Barra de navegación inferior móvil/tablet (< lg) ── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-[#0e1428] border-t border-white/10 flex items-stretch">
        {bottomNavModulos.map((m) => {
          const isActive = view === m.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setView(m.key)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold transition-colors ${
                isActive ? "text-brand-primary" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <span className="text-lg leading-none">{m.icon}</span>
              <span className="truncate max-w-[56px]">{m.label.split(" ")[0]}</span>
            </button>
          );
        })}
        {/* Botón "Más" siempre al final */}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold text-slate-500 hover:text-slate-300 transition-colors"
        >
          <span className="text-lg leading-none">☰</span>
          <span>Más</span>
        </button>
      </nav>

      {mostrarReporte && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setMostrarReporte(false)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <ReportePagoCliente onClose={() => setMostrarReporte(false)} />
          </div>
        </div>
      )}
    </div>
  );
}