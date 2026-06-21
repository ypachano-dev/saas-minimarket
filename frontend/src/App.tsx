import { useState, useEffect } from "react";
import Sidebar, { MODULOS, type ViewKey } from "./components/Sidebar";
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
import ModuloPedidos from "./components/ModuloPedidos"; // <-- 🚀 IMPORTACIÓN CLAVADA AQUÍ
import ModuloBalanza from "./components/ModuloBalanza";
import ModuloTesoreria from "./components/ModuloTesoreria";
import ModuloCartera from "./components/ModuloCartera";
import ModuloEstadisticas from "./components/ModuloEstadisticas";
import ModuloVisitas from "./components/ModuloVisitas";
import ModuloRutas from "./components/ModuloRutas";
import apiClient from "./api/client";

// Decodifica el claim "rol" del JWT sin librerías externas
function getRolFromToken(): string | null {
  const token = localStorage.getItem("access_token");
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.rol ?? null;
  } catch {
    return null;
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const fullHex = hex.replace(shorthandRegex, (_, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

export default function App() {
  const [tasaBcv, setTasaBcv] = useState(602.33);
  const [autenticado, setAutenticado] = useState(!!localStorage.getItem("access_token"));
  const [view, setView] = useState<ViewKey>("dashboard");
  const [mostrarReporte, setMostrarReporte] = useState(false);
  const [inicializado, setInicializado] = useState(false);
  const [branding, setBranding] = useState<{
    tipo_negocio: string;
    nombre_comercial: string;
    color_primario?: string;
    color_secundario?: string;
    modulos_habilitados?: string[];
  } | null>(null);

  const rol = getRolFromToken();
  const modulosHabilitados = branding?.modulos_habilitados ?? [];

  // Route Guard: verificar si el módulo actual está habilitado para este inquilino y rol
  const esModuloValido = (() => {
    if (view === "dashboard") return true;
    if (view === "consola") return rol === "propietario";
    if (rol === "repartidor") return view === "delivery";
    if (rol === "vendedor") {
      const allowedVendedorKeys = ["dashboard", "visitas", "rutas", "ficha"];
      if (!allowedVendedorKeys.includes(view)) return false;
    }
    return modulosHabilitados.includes(view);
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

      const aplicarBranding = (data: any) => {
        setBranding(data);

        // Inyectar variables de color personalizadas de la empresa
        const primaryColor = data.color_primario || "#8b5cf6";
        const secondaryColor = data.color_secundario || "#6366f1";

        document.documentElement.style.setProperty('--color-primary', primaryColor);
        document.documentElement.style.setProperty('--color-secondary', secondaryColor);

        const primaryRgb = hexToRgb(primaryColor);
        const secondaryRgb = hexToRgb(secondaryColor);
        if (primaryRgb) {
          document.documentElement.style.setProperty('--color-primary-rgb', `${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}`);
        }
        if (secondaryRgb) {
          document.documentElement.style.setProperty('--color-secondary-rgb', `${secondaryRgb.r}, ${secondaryRgb.g}, ${secondaryRgb.b}`);
        }
      };

      // Un solo reintento tras una breve espera: si el backend está en medio de un
      // reinicio (deploy/restart de desarrollo), esta llamada puede fallar una vez
      // sin que el negocio realmente carezca de módulos habilitados.
      apiClient.get("/api/v1/empresa/mi-config")
        .then((res) => {
          if (res.data) aplicarBranding(res.data);
          setInicializado(true);
        })
        .catch(() => {
          setTimeout(() => {
            apiClient.get("/api/v1/empresa/mi-config")
              .then((res) => { if (res.data) aplicarBranding(res.data); })
              .catch(() => {})
              .finally(() => setInicializado(true));
          }, 1500);
        });
    }
  }, [autenticado]);

  // Si la vista actual no es válida para el inquilino o rol, hacemos un fallback seguro a "dashboard"
  useEffect(() => {
    if (inicializado && !esModuloValido) {
      setView("dashboard");
    }
  }, [view, inicializado, esModuloValido]);

  if (!autenticado) {
    return <Login onLogin={() => setAutenticado(true)} />;
  }

  if (autenticado && !inicializado) {
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
        </div>
      </div>
    );
  }

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    setBranding(null);
    setInicializado(false);
    setAutenticado(false);
  };

  const modulo = MODULOS.find((m) => m.key === view) ?? MODULOS[0];

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <BannerVencimiento onReportar={() => setMostrarReporte(true)} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          view={view}
          setView={setView}
          onLogout={handleLogout}
          rol={rol}
          tipoNegocio={branding?.tipo_negocio}
          nombreEmpresa={branding?.nombre_comercial}
          modulosHabilitados={modulosHabilitados}
        />
        <main className="flex-1 overflow-y-auto">
          {view === "dashboard" && <DashboardMaestro tipoNegocio={branding?.tipo_negocio} rol={rol} />}
          {view === "delivery" && (rol === "repartidor" ? <ModuloRepartidor /> : <MapaDelivery />)}
          {view === "almacen" && <ModuloAlmacen tasaBcv={tasaBcv} />}
          {view === "ingreso" && (
            <div className="p-6">
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

          {!["dashboard", "delivery", "almacen", "ingreso", "crm", "ficha", "pos", "consola", "pedidos", "balanza", "tesoreria", "cuentas", "estadisticas", "visitas", "rutas"].includes(view) && (
            <div className="p-6">
              <PlaceholderModulo titulo={modulo.label} pendientes={modulo.pendientes ?? []} />
            </div>
          )}
        </main>
      </div>

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