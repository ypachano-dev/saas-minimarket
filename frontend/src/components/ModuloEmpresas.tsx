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

interface SaasConfig {
  nombre_proveedor: string;
  banco_nombre: string;
  banco_codigo: string;
  rif: string;
  telefono_cobro: string;
  zelle_email: string;
  zelle_titular: string;
}

const configVacio: SaasConfig = {
  nombre_proveedor: "", banco_nombre: "", banco_codigo: "",
  rif: "", telefono_cobro: "", zelle_email: "", zelle_titular: "",
};

interface SaasPago {
  id: number;
  empresa_id: number;
  empresa_nombre: string;
  monto: number;
  metodo: string;
  referencia: string;
  comprobante: string | null;
  fecha: string;
  created_at: string;
}

interface EmpresaSaaS {
  id: number;
  rif: string;
  nombre_comercial: string;
  nombre_corto: string | null;
  telefono: string | null;
  direccion: string | null;
  tipo_negocio: string;
  plan_id: number | null;
  sitio_web: string | null;
  instagram: string | null;
  facebook: string | null;
  whatsapp: string | null;
  tiktok: string | null;
  x: string | null;
  modulos_override: Record<string, boolean> | null;
  color_primario: string;
  color_secundario: string;
  logo_url: string | null;
  status: string;
  fecha_inicio: string | null;
  fecha_vencimiento: string | null;
  created_at: string;
  
  owner_id: number | null;
  owner_nombre: string | null;
  owner_email: string | null;
  owner_telefono: string | null;
  
  // Compatibilidad
  agente_vale_activo?: boolean;
  agente_yhorge_activo?: boolean;
  agente_alo_activo?: boolean;
}

// Fecha actual en formato YYYY-MM-DD para inputs type="date"
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const initialForm = {
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
  planId: "",
  fechaInicio: today(),
  fechaVencimiento: "",
  nombreAdmin: "",
  emailAdmin: "",
  telefonoAdmin: "",
  claveTemporal: "",
};

const initialModulos: Record<string, boolean> = Object.fromEntries(MODULOS_ERP.map((m) => [m.key, false]));

const initialAgentesIA: Record<AgenteIAKey, boolean> = { vale: true, yhorge: true, alo: true };

const initialPagoForm = { fecha: today(), monto: "", referencia: "", recibo: "", metodo: "Pago Móvil" };

const inputCls = "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/50";
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
  const [empresas, setEmpresas] = useState<EmpresaSaaS[]>([]);
  const [cargandoEmpresas, setCargandoEmpresas] = useState(true);
  
  const [pagosGlobales, setPagosGlobales] = useState<SaasPago[]>([]);

  const [form, setForm] = useState(initialForm);
  const [modulos, setModulos] = useState<Record<string, boolean>>(initialModulos);
  const [agentesIA, setAgentesIA] = useState<Record<AgenteIAKey, boolean>>(initialAgentesIA);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [editMode, setEditMode] = useState<number | null>(null);

  const [modalEmpresa, setModalEmpresa] = useState<number | null>(null);
  const [pagoForm, setPagoForm] = useState(initialPagoForm);
  const [pagoError, setPagoError] = useState("");
  const [suscripcion, actualizarSuscripcion] = useSuscripcion();
  const [catalogoPlanes, setCatalogoPlanes] = useState<PlanCatalogo[]>([]);
  const [saasConfig, setSaasConfig] = useState<SaasConfig>(configVacio);
  const [editandoConfig, setEditandoConfig] = useState(false);
  const [configForm, setConfigForm] = useState<SaasConfig>(configVacio);
  const [guardandoConfig, setGuardandoConfig] = useState(false);

  async function cargarEmpresas() {
    setCargandoEmpresas(true);
    try {
      const { data } = await apiClient.get<EmpresaSaaS[]>("/api/v1/saas/empresas");
      setEmpresas(data);
    } catch (err) {
      console.error("Error al cargar empresas:", err);
    }
    setCargandoEmpresas(false);
  }

  async function cargarPagos() {
    try {
      const { data } = await apiClient.get<SaasPago[]>("/api/v1/saas/pagos");
      setPagosGlobales(data);
    } catch (err) {
      console.error("Error al cargar pagos:", err);
    }
  }

  async function cargarSaasConfig() {
    try {
      const { data } = await apiClient.get<SaasConfig>("/api/v1/saas-config");
      setSaasConfig(data);
    } catch (err) {
      console.error("Error al cargar config SaaS:", err);
    }
  }

  async function guardarSaasConfig() {
    setGuardandoConfig(true);
    try {
      await apiClient.put("/api/v1/saas-config", configForm);
      setSaasConfig({ ...configForm });
      setEditandoConfig(false);
    } catch (err) {
      console.error("Error al guardar config:", err);
    }
    setGuardandoConfig(false);
  }

  useEffect(() => {
    apiClient.get<PlanCatalogo[]>("/api/v1/planes").then(({ data }) => setCatalogoPlanes(data));
    cargarEmpresas();
    cargarPagos();
    cargarSaasConfig();
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
    
    // Auto-calculate fechaVencimiento to +30 days from fechaInicio
    if (form.fechaInicio) {
      const vence = addDias(form.fechaInicio, 30);
      set("fechaVencimiento", vence);
    }
  }

  function toggleModulo(key: string) {
    setModulos((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleAgenteIA(key: AgenteIAKey) {
    setAgentesIA((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setSubiendoLogo(true);
    setError("");
    const formData = new FormData();
    formData.append("file", file);

    try {
      const { data } = await apiClient.post<{ logo_url: string }>("/api/v1/auth/upload-logo", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      set("logoUrl", data.logo_url);
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Error al subir el logo.");
    } finally {
      setSubiendoLogo(false);
    }
  }

  function iniciarEdicion(emp: EmpresaSaaS) {
    setEditMode(emp.id);
    setForm({
      rif: emp.rif,
      razonSocial: emp.nombre_comercial,
      telefono: emp.telefono || "",
      direccion: emp.direccion || "",
      tipoNegocio: emp.tipo_negocio,
      nombreCorto: emp.nombre_corto || "",
      logoUrl: emp.logo_url || "",
      sitioWeb: emp.sitio_web || "",
      instagram: emp.instagram || "",
      facebook: emp.facebook || "",
      whatsapp: emp.whatsapp || "",
      tiktok: emp.tiktok || "",
      x: emp.x || "",
      colorPrimario: emp.color_primario,
      colorSecundario: emp.color_secundario,
      planId: emp.plan_id ? String(emp.plan_id) : "",
      fechaInicio: emp.fecha_inicio || today(),
      fechaVencimiento: emp.fecha_vencimiento || "",
      nombreAdmin: emp.owner_nombre || "",
      emailAdmin: emp.owner_email || "",
      telefonoAdmin: emp.owner_telefono || "",
      claveTemporal: "", // Vacía, solo se actualiza si se escribe algo
    });
    setModulos(emp.modulos_override || initialModulos);
    setAgentesIA({
      vale: emp.agente_vale_activo ?? true,
      yhorge: emp.agente_yhorge_activo ?? true,
      alo: emp.agente_alo_activo ?? true,
    });

    const formElement = document.getElementById("empresa-form");
    if (formElement) {
      formElement.scrollIntoView({ behavior: "smooth" });
    }
  }

  function cancelarEdicion() {
    setEditMode(null);
    setForm(initialForm);
    setModulos(initialModulos);
    setAgentesIA(initialAgentesIA);
    setError("");
  }

  async function eliminarEmpresa(id: number) {
    if (id === 1) {
      alert("No se puede eliminar la empresa maestra principal.");
      return;
    }
    if (!window.confirm("¿Estás seguro de que deseas eliminar esta empresa? Se borrarán todos los datos operativos y usuarios asociados permanentemente de la base de datos.")) {
      return;
    }
    try {
      await apiClient.delete(`/api/v1/saas/empresas/${id}`);
      cargarEmpresas();
      cargarPagos();
      alert("Empresa eliminada exitosamente.");
    } catch (err: any) {
      alert(err?.response?.data?.detail || "No se pudo eliminar la empresa.");
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!form.rif.trim() || !form.razonSocial.trim() || !form.telefono.trim()) {
      setError("RIF, Razón Social y Teléfono de la Empresa son obligatorios.");
      return;
    }

    if (!form.nombreAdmin.trim() || !form.emailAdmin.trim()) {
      setError("Nombre del Dueño y Correo son obligatorios.");
      return;
    }

    if (!editMode && !form.claveTemporal.trim()) {
      setError("La Clave Temporal es obligatoria para nuevos registros.");
      return;
    }

    if (!form.fechaVencimiento) {
      setError("La Fecha de Vencimiento es obligatoria.");
      return;
    }

    setEnviando(true);
    try {
      if (editMode) {
        // Modo Edición
        await apiClient.put(`/api/v1/saas/empresas/${editMode}`, {
          nombre_comercial: form.razonSocial.trim(),
          rif: form.rif.trim(),
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
          status: empresas.find(em => em.id === editMode)?.status || "activo",
          fecha_inicio: form.fechaInicio || null,
          fecha_vencimiento: form.fechaVencimiento || null,
          owner_nombre: form.nombreAdmin.trim(),
          owner_email: form.emailAdmin.trim(),
          owner_telefono: form.telefonoAdmin.trim() || null,
          owner_password: form.claveTemporal.trim() || null,
        });
        alert("Empresa actualizada exitosamente en la base de datos.");
      } else {
        // Modo Creación
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
          fecha_inicio: form.fechaInicio,
          fecha_vencimiento: form.fechaVencimiento,
        });
        alert("Empresa creada exitosamente en la base de datos.");
      }
      
      cargarEmpresas();
      cancelarEdicion();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "No se pudo procesar la solicitud en el servidor.");
    } finally {
      setEnviando(false);
    }
  }

  async function toggleEstado(emp: EmpresaSaaS) {
    const nuevoEstado = emp.status === "activo" ? "suspendido" : "activo";
    
    // Mantener la sincronía con localStorage para la empresa demo si es la propia
    if (emp.id === suscripcion.empresaId) {
      actualizarSuscripcion({ ...suscripcion, estado: nuevoEstado === "activo" ? "Activo" : "Suspendido" });
    }

    try {
      await apiClient.put(`/api/v1/saas/empresas/${emp.id}`, {
        nombre_comercial: emp.nombre_comercial,
        rif: emp.rif,
        telefono: emp.telefono,
        direccion: emp.direccion,
        tipo_negocio: emp.tipo_negocio,
        plan_id: emp.plan_id,
        sitio_web: emp.sitio_web,
        instagram: emp.instagram,
        facebook: emp.facebook,
        whatsapp: emp.whatsapp,
        tiktok: emp.tiktok,
        x: emp.x,
        modulos_override: emp.modulos_override,
        nombre_corto: emp.nombre_corto,
        logo_url: emp.logo_url,
        color_primario: emp.color_primario,
        color_secundario: emp.color_secundario,
        status: nuevoEstado,
        fecha_inicio: emp.fecha_inicio,
        fecha_vencimiento: emp.fecha_vencimiento,
        owner_nombre: emp.owner_nombre || "",
        owner_email: emp.owner_email || "",
        owner_telefono: emp.owner_telefono || "",
        owner_password: null,
      });
      cargarEmpresas();
    } catch (err: any) {
      alert(err?.response?.data?.detail || "No se pudo cambiar el estado de la empresa.");
    }
  }

  function abrirHistorial(id: number) {
    setModalEmpresa(id);
    setPagoForm(initialPagoForm);
    setPagoError("");
  }

  async function registrarPago(e: FormEvent) {
    e.preventDefault();
    if (modalEmpresa === null) return;
    setPagoError("");

    if (!pagoForm.fecha || !pagoForm.monto.trim() || !pagoForm.referencia.trim()) {
      setPagoError("Fecha de Pago, Monto y Referencia son obligatorios.");
      return;
    }

    const monto = Number(pagoForm.monto);
    if (Number.isNaN(monto) || monto <= 0) {
      setPagoError("El monto debe ser un número mayor a 0.");
      return;
    }

    try {
      await apiClient.post("/api/v1/saas/pagos", {
        empresa_id: modalEmpresa,
        monto,
        metodo: pagoForm.metodo,
        referencia: pagoForm.referencia.trim(),
        comprobante: pagoForm.recibo || null,
        fecha: pagoForm.fecha,
        extender_dias: 30
      });
      
      setPagoForm(initialPagoForm);
      cargarPagos();
      cargarEmpresas();
      alert("Pago registrado con éxito. Suscripción extendida 30 días.");
      
      // Sincronizar localStorage si es el tenant demo
      if (modalEmpresa === suscripcion.empresaId) {
        actualizarSuscripcion({
          ...suscripcion,
          estado: "Activo",
          fechaVencimiento: addDias(suscripcion.fechaVencimiento, 30),
          reportePendiente: null
        });
      }
    } catch (err: any) {
      setPagoError(err?.response?.data?.detail || "No se pudo registrar el pago.");
    }
  }

  function enviarWhatsApp(emp: EmpresaSaaS, tipo: "cobro" | "promo") {
    const tlf = emp.owner_telefono || emp.telefono || "";
    const cleanTlf = tlf.replace(/[^0-9]/g, "");
    const planName = catalogoPlanes.find(p => p.id === emp.plan_id)?.nombre || "SaaS";
    const planPrice = catalogoPlanes.find(p => p.id === emp.plan_id)?.precio_mensual || 0;

    let mensaje = "";
    if (tipo === "cobro") {
      mensaje = `Estimado dueño de ${emp.nombre_comercial}, le saludamos de ${saasConfig.nombre_proveedor || "su proveedor SaaS"}. Le recordamos amablemente que su suscripción al plan ${planName} vence el ${emp.fecha_vencimiento} (Monto: $${planPrice}/mes). Puede reportar su pago en su panel administrativo. ¡Gracias por su preferencia!`;
    } else {
      mensaje = `¡Súper Promoción para ${emp.nombre_comercial}! 🚀 Renueve hoy su plan anual de ${planName} y obtenga un 20% de descuento o reciba 2 meses adicionales totalmente gratis. Responda a este mensaje para reclamar su oferta.`;
    }

    const url = `https://wa.me/${cleanTlf.startsWith("58") ? cleanTlf : "58" + cleanTlf}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, "_blank");
  }

  const empresaModal = empresas.find((e) => e.id === modalEmpresa) ?? null;
  const pagosFiltrados = pagosGlobales.filter(p => p.empresa_id === modalEmpresa);

  return (
    <div className="p-6 space-y-6">
      <header>
        <h2 className="text-3xl font-black tracking-tight text-slate-900">Consola SaaS Maestro</h2>
        <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Panel Maestro de Control de Suscripciones · {APP_NAME}</p>
      </header>

      {error && (
        <div className="rounded-2xl bg-rose-50 border border-rose-100 p-4 text-sm font-semibold text-rose-700 shadow-sm animate-shake">
          ⚠️ {error}
        </div>
      )}

      {/* --- Lista de Clientes Registrados (primero) --- */}
      <section className="rounded-2xl border border-slate-100/80 bg-white shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden space-y-4 p-6">
        <h3 className="text-lg font-black tracking-tight text-slate-900">Listado de Empresas Clientes</h3>
        
        {cargandoEmpresas ? (
          <p className="text-sm text-slate-400 animate-pulse py-4 text-center">Cargando listado de empresas...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Razón Social</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">RIF</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Plan</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Dueño / Admin</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Vencimiento</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Estado</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {empresas.map((emp) => {
                  const planName = catalogoPlanes.find(p => p.id === emp.plan_id)?.nombre || "Sin Plan";
                  const esEmpresaPropia = emp.id === suscripcion.empresaId;
                  const fechaVencimiento = esEmpresaPropia ? suscripcion.fechaVencimiento : (emp.fecha_vencimiento || "");
                  const estado = esEmpresaPropia ? (suscripcion.estado === "Activo" ? "activo" : "suspendido") : emp.status;

                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-700">
                        <div className="flex items-center gap-3">
                          {emp.logo_url && <img src={emp.logo_url} alt="Logo" className="h-7 w-7 rounded-lg object-contain bg-slate-50 border border-slate-100" />}
                          <div>
                            <div>{emp.nombre_comercial}</div>
                            {esEmpresaPropia && suscripcion.reportePendiente && (
                              <div className="mt-0.5 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-black text-blue-700">
                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
                                PAGO PENDIENTE POR REVISAR
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{emp.rif}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 font-semibold">{planName}</td>
                      <td className="px-4 py-3 text-xs">
                        <div className="text-slate-700 font-semibold">{emp.owner_nombre || "Sin Dueño"}</div>
                        <div className="text-slate-400 font-mono">{emp.owner_email}</div>
                      </td>
                      <td className="px-4 py-3"><BadgeVencimiento fecha={fechaVencimiento} /></td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${
                            estado === "activo" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                          }`}
                        >
                          {estado === "activo" ? "Activo" : "Suspendido"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => iniciarEdicion(emp)}
                            title="Editar Datos"
                            className="rounded-full bg-slate-100 p-2 text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            onClick={() => abrirHistorial(emp.id)}
                            title="Historial de Pagos"
                            className="rounded-full bg-slate-100 p-2 text-slate-600 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
                          >
                            🧾
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleEstado(emp)}
                            className={`rounded-full px-2.5 py-1 text-xs font-bold text-white transition-colors ${
                              estado === "activo" ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"
                            }`}
                          >
                            {estado === "activo" ? "Suspender" : "Activar"}
                          </button>
                          <button
                            type="button"
                            onClick={() => eliminarEmpresa(emp.id)}
                            disabled={emp.id === 1}
                            title="Eliminar Empresa"
                            className="rounded-full bg-slate-100 p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors disabled:opacity-30 disabled:hover:bg-slate-100"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* --- PANEL DE GESTIÓN DE PAGOS, COBROS Y PROMOCIONES (Punto 5) --- */}
      <section className="rounded-2xl border border-slate-100/80 bg-white shadow-sm hover:shadow-md transition-all duration-300 p-6 space-y-6">
        <div>
          <h3 className="text-lg font-black tracking-tight text-slate-900">Panel de Control de Cobros y Promociones</h3>
          <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mt-1">Gestión del contacto, cobranzas y ofertas a clientes activos</p>
        </div>

        {/* Datos Bancarios Referenciales para Enviar */}
        {editandoConfig ? (
          <div className="bg-blue-50/30 border border-blue-200 p-4 rounded-2xl space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Editar Datos de Cobro</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Nombre del Proveedor</label>
                <input className={inputCls} value={configForm.nombre_proveedor} onChange={e => setConfigForm(p => ({ ...p, nombre_proveedor: e.target.value }))} placeholder="Tu empresa o nombre comercial" />
              </div>
              <div>
                <label className={labelCls}>RIF del Proveedor</label>
                <input className={inputCls} value={configForm.rif} onChange={e => setConfigForm(p => ({ ...p, rif: e.target.value }))} placeholder="J-12345678-9" />
              </div>
              <div>
                <label className={labelCls}>Banco (Pago Móvil)</label>
                <input className={inputCls} value={configForm.banco_nombre} onChange={e => setConfigForm(p => ({ ...p, banco_nombre: e.target.value }))} placeholder="Ej: Banesco" />
              </div>
              <div>
                <label className={labelCls}>Código del Banco</label>
                <input className={inputCls} value={configForm.banco_codigo} onChange={e => setConfigForm(p => ({ ...p, banco_codigo: e.target.value }))} placeholder="Ej: 0134" />
              </div>
              <div>
                <label className={labelCls}>Teléfono Pago Móvil</label>
                <input className={inputCls} value={configForm.telefono_cobro} onChange={e => setConfigForm(p => ({ ...p, telefono_cobro: e.target.value }))} placeholder="04XX-XXXXXXX" />
              </div>
              <div>
                <label className={labelCls}>Correo Zelle</label>
                <input className={inputCls} value={configForm.zelle_email} onChange={e => setConfigForm(p => ({ ...p, zelle_email: e.target.value }))} placeholder="pagos@tuempresa.com" />
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>Titular Zelle</label>
                <input className={inputCls} value={configForm.zelle_titular} onChange={e => setConfigForm(p => ({ ...p, zelle_titular: e.target.value }))} placeholder="Nombre del titular en Zelle" />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={guardarSaasConfig} disabled={guardandoConfig}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 transition-colors disabled:opacity-50">
                {guardandoConfig ? "Guardando…" : "Guardar"}
              </button>
              <button type="button" onClick={() => setEditandoConfig(false)}
                className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="relative grid grid-cols-1 md:grid-cols-2 gap-4 bg-blue-50/30 border border-blue-100 p-4 rounded-2xl">
            <button type="button"
              onClick={() => { setConfigForm({ ...saasConfig }); setEditandoConfig(true); }}
              className="absolute top-3 right-3 rounded-lg bg-white border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors shadow-sm">
              ✏️ Editar
            </button>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-1">🏦 Cuentas de Cobro Nacional (Pago Móvil)</h4>
              {saasConfig.banco_nombre ? (
                <>
                  <p className="text-xs text-slate-600"><span className="font-semibold">Banco:</span> {saasConfig.banco_nombre}{saasConfig.banco_codigo ? ` (${saasConfig.banco_codigo})` : ""}</p>
                  <p className="text-xs text-slate-600"><span className="font-semibold">RIF:</span> {saasConfig.rif}</p>
                  <p className="text-xs text-slate-600"><span className="font-semibold">Teléfono:</span> {saasConfig.telefono_cobro}</p>
                </>
              ) : (
                <p className="text-xs text-slate-400 italic">Sin configurar — haz clic en Editar</p>
              )}
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-1">🇺🇸 Cuentas de Cobro Internacional (Zelle)</h4>
              {saasConfig.zelle_email ? (
                <>
                  <p className="text-xs text-slate-600"><span className="font-semibold">Correo Zelle:</span> {saasConfig.zelle_email}</p>
                  <p className="text-xs text-slate-600"><span className="font-semibold">Titular:</span> {saasConfig.zelle_titular}</p>
                </>
              ) : (
                <p className="text-xs text-slate-400 italic">Sin configurar — haz clic en Editar</p>
              )}
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Cliente</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Plan / Costo</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Vencimiento</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Acciones de Cobro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {empresas.map((emp) => {
                const plan = catalogoPlanes.find(p => p.id === emp.plan_id);
                const planName = plan?.nombre || "Sin Plan";
                const planPrice = plan?.precio_mensual || 0;
                
                return (
                  <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-700">{emp.nombre_comercial}</div>
                      <div className="text-slate-400 text-xs font-mono">{emp.telefono || emp.owner_telefono}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-700">{planName}</div>
                      <div className="text-xs text-slate-400">${planPrice}/mes</div>
                    </td>
                    <td className="px-4 py-3">
                      <BadgeVencimiento fecha={emp.fecha_vencimiento || ""} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => enviarWhatsApp(emp, "cobro")}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition-colors border border-emerald-100"
                        >
                          💬 Recordar Pago
                        </button>
                        <button
                          type="button"
                          onClick={() => enviarWhatsApp(emp, "promo")}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-purple-50 px-3 py-1.5 text-xs font-bold text-purple-700 hover:bg-purple-100 transition-colors border border-purple-100"
                        >
                          🚀 Enviar Oferta
                        </button>
                        <button
                          type="button"
                          onClick={() => abrirHistorial(emp.id)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 transition-colors"
                        >
                          💵 Registrar Pago
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Catálogo Compacto */}
      <CatalogoPlanes />

      {/* Formulario Reorganizado */}
      <form
        id="empresa-form"
        onSubmit={handleSubmit}
        className="rounded-3xl border border-slate-100/80 bg-white p-8 shadow-sm hover:shadow-md transition-all duration-300 space-y-8 relative"
      >
        {editMode && (
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700 animate-pulse">Editando Empresa ID: {editMode}</span>
            <button type="button" onClick={cancelarEdicion} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500 hover:bg-slate-200">Cancelar</button>
          </div>
        )}

        {/* 1. Datos del Dueño (Primero) */}
        <section>
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 border-b border-slate-100 pb-2">1. Datos del Dueño</h3>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex flex-col">
              <span className={labelCls}>Nombre Completo</span>
              <input className={inputCls} value={form.nombreAdmin} onChange={(e) => set("nombreAdmin", e.target.value)} placeholder="Carlos Gerente" required />
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>Correo (su acceso al sistema)</span>
              <input type="email" className={inputCls} value={form.emailAdmin} onChange={(e) => set("emailAdmin", e.target.value)} placeholder="dueno@empresa.com" required />
              <p className="mt-1 text-[10px] text-slate-400">El dueño inicia sesión con este correo.</p>
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>Teléfono del Dueño</span>
              <input className={inputCls} value={form.telefonoAdmin} onChange={(e) => set("telefonoAdmin", e.target.value)} placeholder="+584141234567" />
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>{editMode ? "Nueva Clave (opcional)" : "Clave Temporal"}</span>
              <input type="password" className={inputCls} value={form.claveTemporal} onChange={(e) => set("claveTemporal", e.target.value)} required={!editMode} placeholder={editMode ? "Dejar vacío para conservar actual" : ""} />
              <p className="mt-1 text-[10px] text-slate-400">Cambio obligatorio en el primer inicio de sesión.</p>
            </label>
          </div>
        </section>

        {/* 2. Datos de la Empresa (Segundo) */}
        <section>
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 border-b border-slate-100 pb-2">2. Datos de la Empresa</h3>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex flex-col">
              <span className={labelCls}>RIF</span>
              <input className={inputCls} value={form.rif} onChange={(e) => set("rif", formatRif(e.target.value))} placeholder="J-12345678-0" maxLength={12} required />
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>Razón Social</span>
              <input className={inputCls} value={form.razonSocial} onChange={(e) => set("razonSocial", e.target.value)} placeholder="MiniMarket Barinas C.A." required />
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
              <span className={labelCls}>Nombre Reducido (Branding)</span>
              <input className={inputCls} value={form.nombreCorto} onChange={(e) => set("nombreCorto", e.target.value)} placeholder="Ej: AgroBarinas" />
            </label>

            {/* Logo upload local (externo) o URL */}
            <div className="flex flex-col col-span-2 gap-3 border border-slate-100 p-4 rounded-2xl bg-slate-50/30">
              <span className={labelCls}>Cargar Logo Corporativo</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex flex-col justify-center">
                  <span className="text-xs text-slate-500 mb-1">Subir imagen desde tu equipo</span>
                  <input type="file" accept="image/*" onChange={handleLogoUpload} className="text-xs text-slate-500 file:mr-4 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                  {subiendoLogo && <span className="text-xs text-slate-400 mt-1 animate-pulse">Subiendo imagen al servidor...</span>}
                </label>
                <label className="flex flex-col">
                  <span className="text-xs text-slate-500 mb-1">O escribe la URL del Logo</span>
                  <input className={inputCls} value={form.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} placeholder="https://.../logo.png" />
                </label>
              </div>
              {form.logoUrl && (
                <div className="mt-2 flex items-center gap-3">
                  <img src={form.logoUrl} alt="Vista Previa" className="h-12 w-12 rounded-xl object-contain border border-slate-200 bg-white" />
                  <span className="text-xs text-slate-400 truncate">{form.logoUrl}</span>
                </div>
              )}
            </div>

            {/* Redes Sociales */}
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

            {/* Colores */}
            <div className="flex items-center gap-4 col-span-2 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
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

        {/* 3. Plan y Vigencia (Tercero) */}
        <section>
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 border-b border-slate-100 pb-2">3. Plan y Módulos Autorizados</h3>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex flex-col col-span-2">
              <span className={labelCls}>Plan de Suscripción</span>
              <select className={inputCls} value={form.planId} onChange={(e) => seleccionarPlan(e.target.value)} required>
                <option value="" disabled>Selecciona un plan...</option>
                {catalogoPlanes.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre} — ${p.precio_mensual}/mes</option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-slate-400">Al elegir un plan se precargan sus módulos y agentes abajo.</p>
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>Fecha de Inicio</span>
              <input type="date" className={inputCls} value={form.fechaInicio} onChange={(e) => set("fechaInicio", e.target.value)} required />
            </label>
            <label className="flex flex-col">
              <span className={labelCls}>Fecha de Vencimiento</span>
              <input type="date" className={inputCls} value={form.fechaVencimiento} onChange={(e) => set("fechaVencimiento", e.target.value)} required />
            </label>
          </div>

          <div className="mt-6 border border-slate-100 p-5 rounded-3xl bg-slate-50/20">
            <MatrizModulosAgentes
              modulos={modulos}
              onToggleModulo={toggleModulo}
              agentesIA={agentesIA}
              onToggleAgenteIA={toggleAgenteIA}
            />
          </div>
        </section>

        <div className="flex gap-4">
          {editMode && (
            <button
              type="button"
              onClick={cancelarEdicion}
              className="w-1/3 rounded-2xl border border-slate-200 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancelar Edición
            </button>
          )}
          <button
            type="submit"
            disabled={enviando}
            className={`rounded-2xl py-3 text-sm font-bold text-white shadow-sm transition-all duration-300 hover:shadow-md disabled:bg-slate-400 ${
              editMode ? "bg-blue-600 hover:bg-blue-700 w-2/3" : "bg-slate-900 hover:bg-slate-700 w-full"
            }`}
          >
            {enviando ? "Guardando..." : editMode ? "Guardar Cambios de la Empresa" : "Registrar Nueva Empresa"}
          </button>
        </div>
      </form>

      {/* --- Modal Historial de Pagos y Registrar Cobros --- */}
      {empresaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setModalEmpresa(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-8 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-2xl font-black tracking-tight text-slate-900">Historial de Pagos</h3>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{empresaModal.nombre_comercial} · RIF: {empresaModal.rif}</p>
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

            {pagoError && (
              <div className="mt-4 bg-rose-50 text-rose-700 border border-rose-100 p-3 rounded-xl text-xs font-bold">
                ⚠️ {pagoError}
              </div>
            )}

            {/* Formulario para registrar pagos reales */}
            <form onSubmit={registrarPago} className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-5">
              <span className="text-xs font-black uppercase tracking-wider text-slate-800 col-span-2">Registrar Nuevo Cobro</span>
              <label className="flex flex-col">
                <span className={labelCls}>Fecha de Pago</span>
                <input type="date" className={inputCls} value={pagoForm.fecha} onChange={(e) => setPagoForm((p) => ({ ...p, fecha: e.target.value }))} required />
              </label>
              <label className="flex flex-col">
                <span className={labelCls}>Monto ($)</span>
                <input type="number" step="0.01" min="0" className={inputCls} value={pagoForm.monto} onChange={(e) => setPagoForm((p) => ({ ...p, monto: e.target.value }))} placeholder="0.00" required />
              </label>
              <label className="flex flex-col">
                <span className={labelCls}>Método de Pago</span>
                <select className={inputCls} value={pagoForm.metodo} onChange={(e) => setPagoForm((p) => ({ ...p, metodo: e.target.value }))}>
                  <option value="Pago Móvil">Pago Móvil</option>
                  <option value="Zelle">Zelle</option>
                  <option value="Transferencia">Transferencia</option>
                  <option value="Efectivo">Efectivo</option>
                </select>
              </label>
              <label className="flex flex-col">
                <span className={labelCls}>Referencia Bancaria</span>
                <input className={inputCls} value={pagoForm.referencia} onChange={(e) => setPagoForm((p) => ({ ...p, referencia: e.target.value }))} placeholder="PM-12345" required />
              </label>
              <label className="flex flex-col col-span-2">
                <span className={labelCls}>Comprobante (URL o Nombre)</span>
                <input className={inputCls} value={pagoForm.recibo} onChange={(e) => setPagoForm((p) => ({ ...p, recibo: e.target.value }))} placeholder="Capture_pago.png" />
              </label>
              <button type="submit" className="col-span-2 rounded-2xl bg-slate-900 py-3 text-sm font-bold text-white transition-all duration-300 hover:bg-slate-700 shadow-sm mt-2">
                Registrar Pago (+30 días)
              </button>
            </form>

            <div className="mt-6 overflow-hidden rounded-2xl border border-slate-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Fecha</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Monto</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Método / Referencia</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">Recibo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagosFiltrados.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-400">Sin pagos registrados en la base de datos.</td>
                    </tr>
                  )}
                  {pagosFiltrados.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3 text-slate-600 text-xs">{p.fecha}</td>
                      <td className="px-4 py-3 font-semibold text-slate-700 text-xs">$ {p.monto.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 text-xs">
                        <div className="font-semibold text-slate-600">{p.metodo}</div>
                        <div className="font-mono text-[10px] text-slate-400">{p.referencia}</div>
                      </td>
                      <td className="px-4 py-3 text-right text-xs">
                        {p.comprobante ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                            📎 {p.comprobante}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-300">Ninguno</span>
                        )}
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
