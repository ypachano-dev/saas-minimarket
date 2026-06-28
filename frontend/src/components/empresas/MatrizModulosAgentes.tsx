export const MODULOS_ERP = [
  { key: "dashboard", label: "Dashboard Maestro" },
  { key: "ingreso", label: "Ingreso de Datos (Clientes, Productos, Empleados, Usuarios, Vehículos, Proveedores)" },
  { key: "pos", label: "Caja / POS (Punto de Venta con Lector y Control de Pesados)" },
  { key: "pedidos", label: "Pedidos y Proyecciones Automatizadas" },
  { key: "delivery", label: "Delivery Exprés (Logística y Rutas)" },
  { key: "crm", label: "Módulo CRM (Bot de Carne + Libro de Faltantes)" },
  { key: "estadisticas", label: "Estadísticas Avanzadas y Demandas" },
  { key: "almacen", label: "Gestión de Almacén (Inventario/Carga/Descarga)" },
  { key: "tesoreria", label: "Bancos y Tesorería (Flujos de efectivo $, Bs y Bancos)" },
  { key: "ficha", label: "Ficha de Catálogo" },
];

export const AGENTES_IA = [
  { key: "vale", label: "Activar Agente VALE (Análisis/BI)" },
  { key: "yhorge", label: "Activar Agente YHORGE (Control/Administración)" },
  { key: "alo", label: "Activar Agente ALO (Ventas/CRM)" },
] as const;

export type AgenteIAKey = typeof AGENTES_IA[number]["key"];

interface MatrizModulosAgentesProps {
  modulos: Record<string, boolean>;
  onToggleModulo: (key: string) => void;
  agentesIA: Record<AgenteIAKey, boolean>;
  onToggleAgenteIA: (key: AgenteIAKey) => void;
}

export default function MatrizModulosAgentes({
  modulos,
  onToggleModulo,
  agentesIA,
  onToggleAgenteIA,
}: MatrizModulosAgentesProps) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">Módulos Autorizados</h3>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {MODULOS_ERP.map((m) => (
            <div key={m.key} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <span className="text-sm font-medium text-slate-700">{m.label}</span>
              <button
                type="button"
                onClick={() => onToggleModulo(m.key)}
                title={`${m.label}: ${modulos[m.key] ? "Activado" : "Desactivado"}`}
                aria-label={`${m.label}: ${modulos[m.key] ? "Activado" : "Desactivado"}`}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300 ${
                  modulos[m.key] ? "bg-emerald-500" : "bg-slate-200"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-300 ${
                    modulos[m.key] ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">Guías de IA Independientes</h3>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {AGENTES_IA.map((a) => (
            <div key={a.key} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <span className="text-sm font-medium text-slate-700">{a.label}</span>
              <button
                type="button"
                onClick={() => onToggleAgenteIA(a.key)}
                title={`${a.label}: ${agentesIA[a.key] ? "Activado" : "Desactivado"}`}
                aria-label={`${a.label}: ${agentesIA[a.key] ? "Activado" : "Desactivado"}`}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300 ${
                  agentesIA[a.key] ? "bg-emerald-500" : "bg-slate-200"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-300 ${
                    agentesIA[a.key] ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
