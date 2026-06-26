import { useEffect, useState } from "react";
import apiClient from "../api/client";
import TicketTermico, { TICKET_CONFIG_DEFAULT, type TicketConfigVM, type TamanoPapel } from "./TicketTermico";

const inputCls = "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const labelCls = "text-xs font-semibold uppercase tracking-wider text-slate-400";

const TAMANOS_PAPEL: { value: TamanoPapel; label: string }[] = [
  { value: "80mm", label: "80mm (estándar)" },
  { value: "57mm", label: "57mm (compacto)" },
];

const DATOS_PREVIEW = {
  facturaNum: 123456,
  fecha: new Date().toLocaleString("es-VE", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" }),
  clienteName: "Cliente de Ejemplo",
  clienteCedula: "V-12345678",
  metodoPago: "Efectivo $",
  lineas: [
    { label: "2x Harina PAN 1kg", monto: 4.5 },
    { label: "1x Aceite Vatel 1L", monto: 3.2 },
  ],
  totalUsd: 7.7,
  totalVes: 7.7 * 36.5,
  montoRecibido: 10,
  vuelto: 2.3,
};

interface EmpresaConfigLite {
  nombre_comercial: string;
  logo_url: string | null;
}

export default function ConfiguracionTienda() {
  const [empresa, setEmpresa] = useState<EmpresaConfigLite | null>(null);
  const [config, setConfig] = useState<TicketConfigVM>(TICKET_CONFIG_DEFAULT);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  useEffect(() => {
    let activo = true;
    apiClient.get("/api/v1/empresa/mi-config").then((res) => {
      if (!activo) return;
      const data = res.data;
      setEmpresa({ nombre_comercial: data.nombre_comercial, logo_url: data.logo_url ?? null });
      if (data.ticket_config) {
        setConfig({
          tamano_papel: data.ticket_config.tamano_papel,
          mostrar_logo: data.ticket_config.mostrar_logo,
          mostrar_rif: data.ticket_config.mostrar_rif,
          texto_cabecera: data.ticket_config.texto_cabecera ?? "",
          texto_pie: data.ticket_config.texto_pie ?? "",
          desglosar_impuestos: data.ticket_config.desglosar_impuestos,
        });
      }
      setCargando(false);
    }).catch(() => setCargando(false));
    return () => { activo = false; };
  }, []);

  function set<K extends keyof TicketConfigVM>(key: K, value: TicketConfigVM[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  async function guardar() {
    setGuardando(true);
    setMensaje(null);
    try {
      await apiClient.put("/api/v1/empresa/config-ticket", {
        tamano_papel: config.tamano_papel,
        mostrar_logo: config.mostrar_logo,
        mostrar_rif: config.mostrar_rif,
        texto_cabecera: config.texto_cabecera,
        texto_pie: config.texto_pie,
        desglosar_impuestos: config.desglosar_impuestos,
      });
      setMensaje({ tipo: "ok", texto: "Configuración de ticket guardada con éxito." });
    } catch (err: any) {
      setMensaje({ tipo: "error", texto: err?.response?.data?.detail || "No se pudo guardar la configuración." });
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) {
    return <div className="p-6 text-sm text-slate-400">Cargando configuración...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <header>
        <h2 className="text-3xl font-black tracking-tight text-slate-900">Configuración de Tienda</h2>
        <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Personalización de Ticket de Caja</p>
      </header>

      {mensaje && (
        <p className={`text-sm font-medium ${mensaje.tipo === "ok" ? "text-emerald-600" : "text-red-600"}`}>{mensaje.texto}</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* --- Panel de Controles --- */}
        <section className="rounded-3xl border border-slate-100/80 bg-white p-6 shadow-sm space-y-5">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">Personalización de Ticket de Caja</h3>

          <label className="flex flex-col">
            <span className={labelCls}>Tamaño de Papel</span>
            <select
              className={inputCls}
              value={config.tamano_papel}
              onChange={(e) => set("tamano_papel", e.target.value as TamanoPapel)}
            >
              {TAMANOS_PAPEL.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col">
            <span className={labelCls}>Texto de Cabecera (dirección, teléfono, etc.)</span>
            <textarea
              className={`${inputCls} resize-none`}
              rows={2}
              value={config.texto_cabecera}
              onChange={(e) => set("texto_cabecera", e.target.value)}
              placeholder="Av. Principal, Local 4 · Tel: 0414-1234567"
            />
          </label>

          <label className="flex flex-col">
            <span className={labelCls}>Texto de Pie de Página</span>
            <textarea
              className={`${inputCls} resize-none`}
              rows={2}
              value={config.texto_pie}
              onChange={(e) => set("texto_pie", e.target.value)}
              placeholder="No se aceptan devoluciones después de 3 días"
            />
          </label>

          <div className="grid grid-cols-1 gap-3">
            {([
              { key: "mostrar_logo" as const, label: "Mostrar Logo en el Ticket" },
              { key: "mostrar_rif" as const, label: "Mostrar RIF de la Empresa" },
              { key: "desglosar_impuestos" as const, label: "Desglosar Impuestos (IVA)" },
            ]).map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
                <span className="text-sm font-medium text-slate-700">{item.label}</span>
                <button
                  type="button"
                  onClick={() => set(item.key, !config[item.key])}
                  title={`${item.label}: ${config[item.key] ? "Activado" : "Desactivado"}`}
                  aria-label={`${item.label}: ${config[item.key] ? "Activado" : "Desactivado"}`}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300 ${
                    config[item.key] ? "bg-emerald-500" : "bg-slate-200"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-300 ${
                      config[item.key] ? "translate-x-5" : ""
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            className="w-full rounded-2xl bg-slate-900 py-3 text-sm font-bold text-white shadow-sm transition-all duration-300 hover:bg-slate-700 hover:shadow-md disabled:bg-slate-400"
          >
            {guardando ? "Guardando..." : "Guardar Configuración"}
          </button>
        </section>

        {/* --- Previsualización en Vivo --- */}
        <section className="rounded-3xl border border-slate-100/80 bg-slate-50 p-6 shadow-sm flex flex-col items-center">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 self-start mb-4">Previsualización en Vivo</h3>
          <TicketTermico
            config={config}
            datos={{
              nombreComercial: empresa?.nombre_comercial || "Mi Negocio",
              rif: "J-12345678-0",
              logoUrl: empresa?.logo_url,
              ...DATOS_PREVIEW,
            }}
          />
        </section>
      </div>
    </div>
  );
}
