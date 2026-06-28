import { useEffect, useState, type FormEvent } from "react";
import apiClient from "../api/client";
import { useSuscripcion, addDias } from "../state/suscripcion";
import { APP_NAME, FIRMA_PROVEEDOR } from "../config/brand";
import MatrizModulosAgentes, { MODULOS_ERP, type AgenteIAKey } from "./empresas/MatrizModulosAgentes";
import CatalogoPlanes, { type PlanCatalogo } from "./empresas/CatalogoPlanes";

const TIPOS_NEGOCIO = [
  { value: "minimarket", label: "Minimarket" },
  { value: "ferreteria", label: "Ferretería" },
  { value: "agropecuaria", label: "Agropecuaria" },
  { value: "ferreagropecuaria", label: "FerreAgropecuaria" },
] as const;

type EstadoEmpresa = "Activo" | "Suspendido";

interface Pago {
  id: number;
  fecha: string;
  monto: number;
  referencia: string;
  recibo: string;
}

interface Empresa {
  id: number;
  rif: string;
  razonSocial: string;
  telefono: string;
  plan: string;
  limiteUsuarios: number;
  usuariosCreados: number;
  estado: EstadoEmpresa;
  modulos: Record<string, boolean>;
  usuarioAdmin: string;
  fechaInicio: string;
  fechaVencimiento: string;
  pagos: Pago[];
}

// Fecha actual en formato YYYY-MM-DD para inputs type="date"
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const EMPRESAS_INICIALES: Empresa[] = [
  {
    id: 1,
    rif: "J-12345678-0",
    razonSocial: "MiniMarket Barinas C.A.",
    telefono: "0273-1234567",
    plan: "Profesional",
    limiteUsuarios: 10,
    usuariosCreados: 6,
    estado: "Activo",
    modulos: { dashboard: true, ingreso: true, pos: true, pedidos: true, delivery: true, crm: false, estadisticas: false, almacen: true, tesoreria: true },
    usuarioAdmin: "admin_barinas",
    fechaInicio: "2026-05-13",
    fechaVencimiento: "2026-06-17",
    pagos: [
      { id: 2, fecha: "2026-06-01", monto: 49.99, referencia: "PM-88291", recibo: "recibo_junio.pdf" },
      { id: 1, fecha: "2026-05-01", monto: 49.99, referencia: "PM-77104", recibo: "recibo_mayo.jpg" },
    ],
  },
  {
    id: 2,
    rif: "J-87654321-9",
    razonSocial: "Bodegón El Sabor",
    telefono: "0414-9876543",
    plan: "Básico",
    limiteUsuarios: 3,
    usuariosCreados: 3,
    estado: "Suspendido",
    modulos: { dashboard: true, ingreso: true, pos: true, pedidos: false, delivery: false, crm: false, estadisticas: false, almacen: false, tesoreria: false },
    usuarioAdmin: "admin_sabor",
    fechaInicio: "2026-04-01",
    fechaVencimiento: "2026-06-01",
    pagos: [],
  },
];

const initialForm = {
  // Datos de la Empresa
  rif: "",
  razonSocial: "",
  telefono: "",
  direccion: "",
  tipoNegocio: TIPOS_NEGOCIO[0].value as string,
  nombreCorto: "",
  logoUrl: "",
  sitioWeb: "",
  instagram: "",
  facebook: "",
  whatsapp: "",
  tiktok: "",
  x: "",
  colorPrimario: "#00ebc7",
  colorSecundario: "#111936",
  // Plan y vigencia
  planId: "",
  fechaInicio: today(),
  fechaVencimiento: "",
  // Datos del Dueño (también su identidad de acceso)
  nombreAdmin: "",
  emailAdmin: "",
  telefonoAdmin: "",
  claveTemporal: "",
};

const initialModulos: Record<string, boolean> = Object.fromEntries(MODULOS_ERP.map((m) => [m.key, false]));

const initialAgentesIA: Record<AgenteIAKey, boolean> = { vale: true, yhorge: true, alo: true };

const initialPagoForm = { fecha: today(), monto: "", referencia: "", recibo: "" };

const inputCls = "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const labelCls = "text-xs font-semibold uppercase tracking-wider text-slate-400";

// Formatea el RIF al estilo criollo: J-12345678-0
function formatRif(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const letra = clean.slice(0, 1).replace(/[^JGVEP]/g, "");
  const numero = clean.slice(1, 9).replace(/[^0-9]/g, "");
  const verificador = clean.slice(9, 10).replace(/[^0-9]/g, "");
  let out = letra;
  if (numero) out += `-${numero}`;
  if (verificador) out += `-${verificador}`;
  return out;
}

// Días restantes hasta el vencimiento (negativo si ya venció)
function diasRestantes(fechaVencimiento: string): number {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(`${fechaVencimiento}T00:00:00`);
  return Math.ceil((venc.getTime() - hoy.getTime()) / 86400000);
}

function BadgeVencimiento({ fecha }: { fecha: string }) {
  const dias = diasRestantes(fecha);
  if (dias < 0) {
    return <span className="rounded-full bg-rose-600 px-3 py-1 text-xs font-black uppercase tracking-wider text-white shadow-sm">Suscripción Expirada</span>;
  }
  if (dias <= 7) {
    return <span className="animate-pulse rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">{dias} día{dias === 1 ? "" : "s"} restante{dias === 1 ? "" : "s"}</span>;
  }
  return <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">{dias} días restantes</span>;
}

export default function ModuloEmpresas() {
  const [empresas, setEmpresas] = useState<Empresa[]>(EMPRESAS_INICIALES);
  const [form, setForm] = useState(initialForm);
  const [modulos, setModulos] = useState<Record<string, boolean>>(initialModulos);
  const [agentesIA, setAgentesIA] = useState<Record<AgenteIAKey, boolean>>(initialAgentesIA);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [modalEmpresa, setModalEmpresa] = useState<number | null>(null);
  const [pagoForm, setPagoForm] = useState(initialPagoForm);
  const [pagoError, setPagoError] = useState("");
  const [suscripcion, actualizarSuscripcion] = useSuscripcion();
  const [catalogoPlanes, setCatalogoPlanes] = useState<PlanCatalogo[]>([]);

  useEffect(() => {
    apiClient.get<PlanCatalogo[]>("/api/v1/planes").then(({ data }) => setCatalogoPlanes(data));
  }, []);

  function set<K extends keyof typeof initialForm>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function seleccionarPlan(planIdStr: string) {
    set("planId", planIdStr);
    const plan = catalogoPlanes.find((p) => String(p.id) === planIdStr);
    if (!plan) return;
    setModulos(plan.modulos);
    setAgentesIA({ vale: plan.agente_vale_incluido, yhorge: plan.agente_yhorge_incluido, alo: plan.agente_alo_incluido });
  }

  function toggleModulo(key: string) {
    setModulos((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleAgenteIA(key: AgenteIAKey) {
    setAgentesIA((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!form.rif.trim() || !form.razonSocial.trim() || !form.telefono.trim()) {
      setError("RIF, Razón Social y Teléfono de la Empresa son obligatorios.");
      return;
    }

    if (!form.nombreAdmin.trim() || !form.emailAdmin.trim() || !form.claveTemporal.trim()) {
      setError("Nombre del Dueño, Correo y Clave Temporal son obligatorios.");
      return;
    }

    if (!form.fechaVencimiento) {
      setError("La Fecha de Vencimiento es obligatoria.");
      return;
    }

    setEnviando(true);
    try {
      await apiClient.post("/api/v1/auth/registrar-saas", {
        nombre_empresa: form.razonSocial.trim(),
        rif_or_cedula: form.rif.trim(),
        telefono: form.telefono.trim(),
        direccion: form.direccion.trim() || null,
        tipo_negocio: form.tipoNegocio,
        plan_id: form.planId ? Number(form.planId) : null,
        sitio_web: form.sitioWeb.trim() || null,
        instagram: form.instagram.trim() || null,
        facebook: form.facebook.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        tiktok: form.tiktok.trim() || null,
        x: form.x.trim() || null,
        modulos_override: modulos,
        nombre_corto: form.nombreCorto.trim() || null,
        logo_url: form.logoUrl.trim() || null,
        color_primario: form.colorPrimario,
        color_secundario: form.colorSecundario,
        agente_vale_activo: agentesIA.vale,
        agente_yhorge_activo: agentesIA.yhorge,
        agente_alo_activo: agentesIA.alo,
        nombre_admin: form.nombreAdmin.trim(),
        email_admin: form.emailAdmin.trim(),
        telefono_admin: form.telefonoAdmin.trim() || null,
        password_admin: form.claveTemporal,
      });
    } catch (err: any) {
      setError(err?.response?.data?.detail || "No se pudo crear la empresa en el servidor.");
      setEnviando(false);
      return;
    }
    setEnviando(false);

    const planSeleccionado = catalogoPlanes.find((p) => String(p.id) === form.planId);

    const nuevaEmpresa: Empresa = {
      id: empresas.length ? Math.max(...empresas.map((emp) => emp.id)) + 1 : 1,
      rif: form.rif.trim(),
      razonSocial: form.razonSocial.trim(),
      telefono: form.telefono.trim(),
      plan: planSeleccionado?.nombre ?? "Sin plan",
      limiteUsuarios: planSeleccionado?.limite_usuarios ?? 0,
      usuariosCreados: 1,
      estado: "Activo",
      modulos: { ...modulos },
      usuarioAdmin: form.emailAdmin.trim(),
      fechaInicio: form.fechaInicio,
      fechaVencimiento: form.fechaVencimiento,
      pagos: [],
    };

    setEmpresas((prev) => [nuevaEmpresa, ...prev]);
    setForm(initialForm);
    setModulos(initialModulos);
    setAgentesIA(initialAgentesIA);
  }

  function toggleEstado(id: number) {
    if (id === suscripcion.empresaId) {
      actualizarSuscripcion({ ...suscripcion, estado: suscripcion.estado === "Activo" ? "Suspendido" : "Activo" });
      return;
    }
    setEmpresas((prev) =>
      prev.map((emp) => (emp.id === id ? { ...emp, estado: emp.estado === "Activo" ? "Suspendido" : "Activo" } : emp))
    );
  }

  // Aprueba el reporte de pago del cliente: lo agrega al historial y extiende el cronómetro 30 días
  function aprobarSuscripcion() {
    const reporte = suscripcion.reportePendiente;
    if (!reporte) return;

    setEmpresas((prev) =>
      prev.map((emp) =>
        emp.id === suscripcion.empresaId
          ? {
              ...emp,
              pagos: [
                {
                  id: emp.pagos.length ? Math.max(...emp.pagos.map((p) => p.id)) + 1 : 1,
                  fecha: reporte.fecha,
                  monto: reporte.monto,
                  referencia: reporte.referencia,
                  recibo: reporte.recibo,
                },
                ...emp.pagos,
              ],
            }
          : emp
      )
    );

    actualizarSuscripcion({
      ...suscripcion,
      estado: "Activo",
      fechaVencimiento: addDias(suscripcion.fechaVencimiento, 30),
      reportePendiente: null,
    });
  }

  function abrirHistorial(id: number) {
    setModalEmpresa(id);
    setPagoForm(initialPagoForm);
    setPagoError("");
  }

  function registrarPago(e: FormEvent) {
    e.preventDefault();
    if (modalEmpresa === null) return;
    setPagoError("");

    if (!pagoForm.fecha || !pagoForm.monto.trim() || !pagoForm.referencia.trim()) {
      setPagoError("Fecha de Pago, Monto y Referencia de Transacción son obligatorios.");
      return;
    }

    const monto = Number(pagoForm.monto);
    if (Number.isNaN(monto) || monto <= 0) {
      setPagoError("Monto debe ser un número mayor a 0.");
      return;
    }

    setEmpresas((prev) =>
      prev.map((emp) =>
        emp.id === modalEmpresa
          ? {
              ...emp,
              pagos: [
                {
                  id: emp.pagos.length ? Math.max(...emp.pagos.map((p) => p.id)) + 1 : 1,
                  fecha: pagoForm.fecha,
                  monto,
                  referencia: pagoForm.referencia.trim(),
                  recibo: pagoForm.recibo || "Sin adjunto",
                },
                ...emp.pagos,
              ],
            }
          : emp
      )
    );
    setPagoForm(initialPagoForm);
  }

  const empresaModal = empresas.find((e) => e.id === modalEmpresa) ?? null;

  return (
    <div className="p-6 space-y-6">
      <header>
        <h2 className="text-3xl font-black tracking-tight text-slate-900">Consola SaaS Maestro</h2>
        <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Panel Maestro de Control de Suscripciones · {APP_NAME}</p>
      </header>

      {error && <p className="text-sm font-medium text-red-600">{error}</p>}

      <CatalogoPlanes />

      <form onSubmit={handleSubmit} className="rounded-3xl border border-slate-100/80 bg-white p-8 shadow-sm hover:shadow-md transition-all duration-300 space-y-8">
        {/* --- Datos de la Empresa --- */}
        <section>
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">Datos de la Empresa</h3>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <label className="flex flex-col">
              <span className={labelCls}>RIF</span>
              <input className={inputCls} value={form.rif} onChange={(e) => set("rif", formatRif(e.target.value))} placeholder="J-12345678-0" maxLength={12} required />
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>Razón Social</span>
              <input className={inputCls} value={form.razonSocial} onChange={(e) => set("razonSocial", e.target.value)} placeholder="Ej: MiniMarket Barinas C.A." required />
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>Teléfono de la Empresa</span>
              <input className={inputCls} value={form.telefono} onChange={(e) => set("telefono", e.target.value)} placeholder="+584141234567" required />
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>Dirección</span>
              <input className={inputCls} value={form.direccion} onChange={(e) => set("direccion", e.target.value)} placeholder="Av. Principal, Barinas" />
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>Tipo de Negocio</span>
              <select className={inputCls} value={form.tipoNegocio} onChange={(e) => set("tipoNegocio", e.target.value)} required>
                {TIPOS_NEGOCIO.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>Nombre Reducido</span>
              <input className={inputCls} value={form.nombreCorto} onChange={(e) => set("nombreCorto", e.target.value)} placeholder="Ej: AgroBarinas" />
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>URL del Logo</span>
              <input className={inputCls} value={form.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} placeholder="https://.../logo.png" />
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>Sitio Web</span>
              <input className={inputCls} value={form.sitioWeb} onChange={(e) => set("sitioWeb", e.target.value)} placeholder="https://miempresa.com" />
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>Instagram</span>
              <input className={inputCls} value={form.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder="@miempresa" />
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>Facebook</span>
              <input className={inputCls} value={form.facebook} onChange={(e) => set("facebook", e.target.value)} placeholder="facebook.com/miempresa" />
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>WhatsApp</span>
              <input className={inputCls} value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} placeholder="+584141234567" />
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>TikTok</span>
              <input className={inputCls} value={form.tiktok} onChange={(e) => set("tiktok", e.target.value)} placeholder="@miempresa" />
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>X (Twitter)</span>
              <input className={inputCls} value={form.x} onChange={(e) => set("x", e.target.value)} placeholder="@miempresa" />
            </label>
            <div className="flex items-center gap-4">
              <label className="flex flex-1 flex-col">
                <span className={labelCls}>Color Primario</span>
                <input type="color" className="mt-1 h-10 w-full cursor-pointer rounded-xl border border-slate-200" value={form.colorPrimario} onChange={(e) => set("colorPrimario", e.target.value)} />
              </label>
              <label className="flex flex-1 flex-col">
                <span className={labelCls}>Color Secundario</span>
                <input type="color" className="mt-1 h-10 w-full cursor-pointer rounded-xl border border-slate-200" value={form.colorSecundario} onChange={(e) => set("colorSecundario", e.target.value)} />
              </label>
            </div>
          </div>
        </section>

        {/* --- Datos del Dueño --- */}
        <section>
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">Datos del Dueño</h3>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <label className="flex flex-col">
              <span className={labelCls}>Nombre Completo</span>
              <input className={inputCls} value={form.nombreAdmin} onChange={(e) => set("nombreAdmin", e.target.value)} placeholder="Ej: Carlos Gerente" required />
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>Correo (su acceso al sistema)</span>
              <input type="email" className={inputCls} value={form.emailAdmin} onChange={(e) => set("emailAdmin", e.target.value)} placeholder="dueno@empresa.com" required />
              <p className="mt-1 text-xs text-slate-400">El dueño inicia sesión con este correo.</p>
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>Teléfono del Dueño</span>
              <input className={inputCls} value={form.telefonoAdmin} onChange={(e) => set("telefonoAdmin", e.target.value)} placeholder="+584141234567" />
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>Clave Temporal</span>
              <input type="password" className={inputCls} value={form.claveTemporal} onChange={(e) => set("claveTemporal", e.target.value)} required />
              <p className="mt-1 text-xs text-slate-400">El cliente deberá cambiar esta clave obligatoriamente en su primer inicio de sesión.</p>
            </label>
          </div>
        </section>

        {/* --- Plan y Vigencia --- */}
        <section>
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">Plan y Vigencia</h3>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <label className="flex flex-col col-span-2">
              <span className={labelCls}>Plan de Suscripción</span>
              <select className={inputCls} value={form.planId} onChange={(e) => seleccionarPlan(e.target.value)} required>
                <option value="" disabled>Selecciona un plan...</option>
                {catalogoPlanes.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre} — ${p.precio_mensual}/mes</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-400">Al elegir un plan se precargan sus módulos y agentes abajo — puedes ajustarlos después.</p>
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>Fecha de Inicio de Suscripción</span>
              <input type="date" className={inputCls} value={form.fechaInicio} onChange={(e) => set("fechaInicio", e.target.value)} required />
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>Fecha de Vencimiento</span>
              <input type="date" className={inputCls} value={form.fechaVencimiento} onChange={(e) => set("fechaVencimiento", e.target.value)} required />
            </label>
          </div>
        </section>

        {/* --- Matriz Táctica de Módulos Aprobados y Guías de IA --- */}
        <MatrizModulosAgentes
          modulos={modulos}
          onToggleModulo={toggleModulo}
          agentesIA={agentesIA}
          onToggleAgenteIA={toggleAgenteIA}
        />

        <button
          type="submit"
          disabled={enviando}
          className="w-full rounded-2xl bg-slate-900 py-3 text-sm font-bold text-white shadow-sm transition-all duration-300 hover:bg-slate-700 hover:shadow-md disabled:bg-slate-400"
        >
          {enviando ? "Creando Empresa..." : "Crear Empresa"}
        </button>
      </form>

      {/* --- Tabla de Empresas Activas --- */}
      <section className="rounded-2xl border border-slate-100/80 bg-white shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left">
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Razón Social</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">RIF</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Plan</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Usuarios</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Módulos Activos</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Vencimiento</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Estado</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {empresas.map((emp) => {
              const activos = Object.values(emp.modulos).filter(Boolean).length;
              const esEmpresaPropia = emp.id === suscripcion.empresaId;
              const fechaVencimiento = esEmpresaPropia ? suscripcion.fechaVencimiento : emp.fechaVencimiento;
              const estado = esEmpresaPropia ? suscripcion.estado : emp.estado;
              return (
                <tr key={emp.id}>
                  <td className="px-4 py-3 font-medium text-slate-700">
                    {emp.razonSocial}
                    {esEmpresaPropia && suscripcion.reportePendiente && (
                      <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                        PAGO PENDIENTE POR REVISAR
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-500">{emp.rif}</td>
                  <td className="px-4 py-3 text-slate-600">{emp.plan}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <span className={emp.usuariosCreados >= emp.limiteUsuarios ? "font-bold text-rose-600" : "font-semibold text-slate-700"}>
                      {emp.usuariosCreados}
                    </span>
                    {" / "}{emp.limiteUsuarios}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{activos} / {MODULOS_ERP.length}</td>
                  <td className="px-4 py-3"><BadgeVencimiento fecha={fechaVencimiento} /></td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        estado === "Activo" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                      }`}
                    >
                      {estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => abrirHistorial(emp.id)}
                        title="Historial de Pagos"
                        className="rounded-full bg-slate-100 p-2 text-slate-500 transition-colors duration-300 hover:bg-slate-200 hover:text-slate-900"
                      >
                        🧾
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleEstado(emp.id)}
                        className={`rounded-full px-3 py-1.5 text-xs font-bold text-white transition-colors duration-300 ${
                          estado === "Activo" ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"
                        }`}
                      >
                        {estado === "Activo" ? "Suspender Acceso" : "Activar Manual"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* --- Modal Historial de Pagos --- */}
      {empresaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setModalEmpresa(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-8 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-black tracking-tight text-slate-900">Historial de Pagos</h3>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{empresaModal.razonSocial} · {empresaModal.rif}</p>
              </div>
              <button
                type="button"
                onClick={() => setModalEmpresa(null)}
                title="Cerrar"
                aria-label="Cerrar"
                className="rounded-full bg-slate-100 p-2 text-slate-500 transition-colors duration-300 hover:bg-slate-200 hover:text-slate-900"
              >
                ✕
              </button>
            </div>

            {pagoError && <p className="mt-3 text-sm font-medium text-red-600">{pagoError}</p>}

            {empresaModal.id === suscripcion.empresaId && suscripcion.reportePendiente && (
              <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-700">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                  Reporte de Pago del Cliente · Esperando Aprobación
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <p><span className="text-slate-400">Método:</span> <span className="font-semibold text-slate-700">{suscripcion.reportePendiente.metodo}</span></p>
                  <p><span className="text-slate-400">Fecha:</span> <span className="font-semibold text-slate-700">{suscripcion.reportePendiente.fecha}</span></p>
                  <p><span className="text-slate-400">Monto:</span> <span className="font-semibold text-slate-700">$ {suscripcion.reportePendiente.monto.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p>
                  <p><span className="text-slate-400">Referencia:</span> <span className="font-mono font-semibold text-slate-700">{suscripcion.reportePendiente.referencia}</span></p>
                  <p className="col-span-2"><span className="text-slate-400">Comprobante:</span> <span className="font-semibold text-slate-700">📎 {suscripcion.reportePendiente.recibo}</span></p>
                </div>
                <button
                  type="button"
                  onClick={aprobarSuscripcion}
                  className="mt-4 w-full rounded-2xl bg-emerald-600 py-2.5 text-sm font-bold text-white transition-colors duration-300 hover:bg-emerald-700"
                >
                  Aprobar Suscripción (+30 días)
                </button>
              </div>
            )}

            <form onSubmit={registrarPago} className="mt-6 grid grid-cols-2 gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <label className="flex flex-col">
                <span className={labelCls}>Fecha de Pago</span>
                <input type="date" className={inputCls} value={pagoForm.fecha} onChange={(e) => setPagoForm((p) => ({ ...p, fecha: e.target.value }))} required />
              </label>
              <label className="flex flex-col">
                <span className={labelCls}>Monto ($)</span>
                <input type="number" step="0.01" min="0" className={inputCls} value={pagoForm.monto} onChange={(e) => setPagoForm((p) => ({ ...p, monto: e.target.value }))} placeholder="0.00" required />
              </label>
              <label className="flex flex-col">
                <span className={labelCls}>Referencia de Transacción</span>
                <input className={inputCls} value={pagoForm.referencia} onChange={(e) => setPagoForm((p) => ({ ...p, referencia: e.target.value }))} placeholder="PM-12345" required />
              </label>
              <label className="flex flex-col">
                <span className={labelCls}>Recibo de Pago / Capture</span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className={`${inputCls} py-1.5`}
                  onChange={(e) => setPagoForm((p) => ({ ...p, recibo: e.target.files?.[0]?.name ?? "" }))}
                />
              </label>
              <button type="submit" className="col-span-2 rounded-2xl bg-slate-900 py-2.5 text-sm font-bold text-white transition-all duration-300 hover:bg-slate-700">
                Registrar Pago
              </button>
            </form>

            <div className="mt-6 overflow-hidden rounded-2xl border border-slate-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Fecha</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Monto</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Referencia</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">Recibo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {empresaModal.pagos.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-400">Sin pagos registrados.</td>
                    </tr>
                  )}
                  {empresaModal.pagos.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3 text-slate-600">{p.fecha}</td>
                      <td className="px-4 py-3 font-semibold text-slate-700">$ {p.monto.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 font-mono text-slate-500">{p.referencia}</td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 transition-colors duration-300 hover:bg-slate-200">
                          📎 {p.recibo}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <p className="text-center text-[10px] font-medium text-slate-400 tracking-wide pt-2">{FIRMA_PROVEEDOR}</p>
    </div>
  );
}
