import { useState, type FormEvent, useEffect } from "react";
import apiClient from "../api/client";
import FichaProducto from "./FichaProducto";
import ListadoProductos from "./ListadoProductos";
import ModuloDesposte from "./ModuloDesposte";
import Modal from "./Modal";

interface Empleado {
  id: number;
  nombre: string;
  email: string;
  rol: string;
  status: boolean;
  created_at: string;
}

interface Proveedor {
  id: number;
  rif: string;
  nombre: string;
  telefono?: string;
  email?: string;
  direccion?: string;
}

interface Vehiculo {
  id: number;
  placa: string;
  marca: string;
  modelo: string;
  tipo: string;
  status: string;
}

interface Cliente {
  id: number;
  cedula: string;
  nombre: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  instagram?: string;
  telegram?: string;
  lat?: number | null;
  lng?: number | null;
}

const TIPOS_CLIENTE = ["V", "E", "J", "G"];
const CARGOS = ["cajero", "supervisor", "carnicero", "motorizado", "administrador"];
const TIPOS_VEHICULO = ["Moto", "Carro", "Camión"];
const ESTATUS_VEHICULO = ["Operativo", "Mantenimiento", "Inactivo"];

type Msg = { tipo: "ok" | "error"; texto: string } | null;

const inputCls = "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/50 font-medium";
const labelCls = "text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1";
const cardCls = "rounded-3xl bg-white p-8 border border-slate-100 shadow-sm space-y-6";
const btnCls = "w-full mt-4 rounded-2xl bg-slate-900 py-3 text-sm font-bold text-white transition-all duration-300 hover:bg-blue-600 shadow-md";

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

function MsgLine({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <div className={`p-3 rounded-xl text-xs font-bold border ${msg.tipo === "ok" ? "bg-emerald-50 border-emerald-100 text-emerald-600" : "bg-rose-50 border-rose-100 text-rose-600"} text-center`}>
      {msg.texto}
    </div>
  );
}

function soloNumeros(value: string): string {
  return value.replace(/\D/g, "");
}

// Extrae lat/lng de lo que sea que el cliente pegue: un link de ubicación de WhatsApp/Google Maps
// (https://maps.google.com/?q=10.48,-66.90, https://www.google.com/maps/place/10.48,-66.90, etc.)
// o simplemente el par de coordenadas en texto plano "10.48, -66.90".
function extraerCoordenadas(texto: string): { lat: number; lng: number } | null {
  const match = texto.match(/(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (Number.isNaN(lat) || Number.isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

// --- Clientes ---
const clienteFormVacio = { tipo: "V", cedula: "", nombre: "", telefono: "", email: "", direccion: "", instagram: "", telegram: "", lat: "", lng: "" };

function clienteAForm(c: Cliente): typeof clienteFormVacio {
  const [tipo, ...resto] = c.cedula.split("-");
  return {
    tipo: TIPOS_CLIENTE.includes(tipo) ? tipo : "V",
    cedula: resto.join("-"),
    nombre: c.nombre,
    telefono: c.telefono || "",
    email: c.email || "",
    direccion: c.direccion || "",
    instagram: c.instagram || "",
    telegram: c.telegram || "",
    lat: c.lat != null ? String(c.lat) : "",
    lng: c.lng != null ? String(c.lng) : "",
  };
}

function FormularioCliente({ inicial, onGuardar, msg }: { inicial: typeof clienteFormVacio; onGuardar: (form: typeof clienteFormVacio) => void; msg: Msg }) {
  const [form, setForm] = useState(inicial);
  const [pegado, setPegado] = useState("");
  const [avisoUbicacion, setAvisoUbicacion] = useState("");

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    onGuardar(form);
  }

  function extraerDePegado() {
    const coords = extraerCoordenadas(pegado);
    if (!coords) {
      setAvisoUbicacion("No se reconocieron coordenadas en ese texto. Asegúrate de pegar el link de ubicación completo.");
      return;
    }
    set("lat", String(coords.lat));
    set("lng", String(coords.lng));
    setAvisoUbicacion(`✓ Ubicación detectada: ${coords.lat}, ${coords.lng}`);
  }

  function usarUbicacionActual() {
    if (!navigator.geolocation) {
      setAvisoUbicacion("Este dispositivo no soporta geolocalización.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        set("lat", String(pos.coords.latitude));
        set("lng", String(pos.coords.longitude));
        setAvisoUbicacion("✓ Ubicación actual del dispositivo capturada.");
      },
      () => setAvisoUbicacion("No se pudo obtener la ubicación (permiso denegado o señal débil).")
    );
  }

  return (
    <>
      <MsgLine msg={msg} />
      <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
        <label className="flex flex-col">
          <span className={labelCls}>Tipo</span>
          <select className={inputCls} value={form.tipo} onChange={(e) => set("tipo", e.target.value)}>
            {TIPOS_CLIENTE.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          <span className={labelCls}>Cédula / RIF</span>
          <input className={inputCls} value={form.cedula} onChange={(e) => set("cedula", soloNumeros(e.target.value))} placeholder="12345678" inputMode="numeric" required />
        </label>
        <label className="col-span-2 flex flex-col">
          <span className={labelCls}>Nombre Completo / Razón Social</span>
          <input className={inputCls} value={form.nombre} onChange={(e) => set("nombre", e.target.value)} required />
        </label>
        <label className="flex flex-col">
          <span className={labelCls}>Teléfono</span>
          <input className={inputCls} value={form.telefono} onChange={(e) => set("telefono", e.target.value)} placeholder="+584141234567" />
        </label>
        <label className="flex flex-col">
          <span className={labelCls}>Email</span>
          <input type="email" className={inputCls} value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="cliente@correo.com" />
        </label>
        <label className="flex flex-col">
          <span className={labelCls}>Instagram</span>
          <input className={inputCls} value={form.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder="@usuario_instagram" />
        </label>
        <label className="flex flex-col">
          <span className={labelCls}>Telegram</span>
          <input className={inputCls} value={form.telegram} onChange={(e) => set("telegram", e.target.value)} placeholder="@alias_telegram" />
        </label>
        <label className="col-span-2 flex flex-col">
          <span className={labelCls}>Dirección Fiscal Completa</span>
          <textarea className={inputCls} rows={3} value={form.direccion} onChange={(e) => set("direccion", e.target.value)} placeholder="Av., Calle, Sector, Ciudad, Estado..." />
        </label>

        <div className="col-span-2 rounded-2xl border border-dashed border-blue-200 bg-blue-50/40 p-4 space-y-3">
          <p className={labelCls}>Ubicación GPS (para Delivery)</p>
          <label className="flex flex-col">
            <span className="text-[10px] font-semibold text-slate-400">Pega aquí el link de ubicación que el cliente envía por WhatsApp</span>
            <div className="flex gap-2 mt-1">
              <input
                className={`${inputCls} mt-0`}
                value={pegado}
                onChange={(e) => setPegado(e.target.value)}
                placeholder="https://maps.google.com/?q=10.4806,-66.9036"
              />
              <button type="button" onClick={extraerDePegado} className="shrink-0 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4">
                Extraer
              </button>
            </div>
          </label>
          <div className="flex items-center gap-2">
            <button type="button" onClick={usarUbicacionActual} className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3 py-2">
              📍 Usar mi ubicación actual
            </button>
            {form.lat && form.lng && (
              <a
                href={`https://www.google.com/maps?q=${form.lat},${form.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-bold text-blue-600 hover:underline"
              >
                Ver en Google Maps ↗
              </a>
            )}
          </div>
          {avisoUbicacion && <p className="text-[11px] font-semibold text-slate-500">{avisoUbicacion}</p>}
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col">
              <span className="text-[10px] font-semibold text-slate-400">Latitud</span>
              <input type="number" step="any" className={inputCls} value={form.lat} onChange={(e) => set("lat", e.target.value)} placeholder="10.4806" />
            </label>
            <label className="flex flex-col">
              <span className="text-[10px] font-semibold text-slate-400">Longitud</span>
              <input type="number" step="any" className={inputCls} value={form.lng} onChange={(e) => set("lng", e.target.value)} placeholder="-66.9036" />
            </label>
          </div>
        </div>

        <div className="col-span-2">
          <button type="submit" className={btnCls}>Guardar Cliente</button>
        </div>
      </form>
    </>
  );
}

function FormClientes() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [clienteEditar, setClienteEditar] = useState<Cliente | null>(null);
  const [msgModal, setMsgModal] = useState<Msg>(null);

  async function cargarClientes() {
    try {
      const res = await apiClient.get<Cliente[]>("/api/v1/clientes", { params: { limit: 500 } });
      setClientes(res.data);
    } catch {
      setClientes([]);
    }
  }

  useEffect(() => {
    cargarClientes();
  }, []);

  async function crear(form: typeof clienteFormVacio) {
    setMsg(null);
    if (!form.cedula.trim() || !form.nombre.trim()) {
      setMsg({ tipo: "error", texto: "Cédula/RIF y Nombre Completo son obligatorios." });
      return;
    }
    try {
      await apiClient.post("/api/v1/clientes", {
        cedula: `${form.tipo}-${form.cedula.trim()}`,
        nombre: form.nombre.trim(),
        telefono: form.telefono.trim() || null,
        email: form.email.trim() || null,
        direccion: form.direccion.trim() || null,
        instagram: form.instagram.trim() || null,
        telegram: form.telegram.trim() || null,
        lat: form.lat.trim() ? Number(form.lat) : null,
        lng: form.lng.trim() ? Number(form.lng) : null,
      });
      setMsg({ tipo: "ok", texto: "Cliente registrado correctamente." });
      cargarClientes();
    } catch (err: any) {
      setMsg({ tipo: "error", texto: err.response?.data?.detail ?? "No se pudo registrar el cliente." });
    }
  }

  async function guardarEdicion(form: typeof clienteFormVacio) {
    if (!clienteEditar) return;
    setMsgModal(null);
    if (!form.cedula.trim() || !form.nombre.trim()) {
      setMsgModal({ tipo: "error", texto: "Cédula/RIF y Nombre Completo son obligatorios." });
      return;
    }
    try {
      await apiClient.put(`/api/v1/clientes/${clienteEditar.id}`, {
        cedula: `${form.tipo}-${form.cedula.trim()}`,
        nombre: form.nombre.trim(),
        telefono: form.telefono.trim() || null,
        email: form.email.trim() || null,
        direccion: form.direccion.trim() || null,
        instagram: form.instagram.trim() || null,
        telegram: form.telegram.trim() || null,
        lat: form.lat.trim() ? Number(form.lat) : null,
        lng: form.lng.trim() ? Number(form.lng) : null,
      });
      setClienteEditar(null);
      cargarClientes();
    } catch (err: any) {
      setMsgModal({ tipo: "error", texto: err.response?.data?.detail ?? "No se pudo actualizar el cliente." });
    }
  }

  const clientesFiltrados = clientes.filter((c) =>
    c.nombre.toLowerCase().includes(busqueda.toLowerCase()) || c.cedula.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className={cardCls}>
        <div>
          <h3 className="text-xl font-black tracking-tight text-slate-900">Registrar Nuevo Cliente</h3>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Control de cartera de clientes</p>
        </div>
        <FormularioCliente key="nuevo" inicial={clienteFormVacio} onGuardar={crear} msg={msg} />
      </div>

      <div className="rounded-3xl bg-white border border-slate-100 shadow-sm overflow-hidden p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
          <h4 className="text-sm font-black text-slate-950 uppercase tracking-wider">Clientes Registrados</h4>
          <input
            type="text"
            className="w-full md:w-64 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/50"
            placeholder="Buscar por nombre o cédula..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold uppercase text-slate-400">
                <th className="px-6 py-3">Nombre</th>
                <th className="px-6 py-3">Cédula/RIF</th>
                <th className="px-6 py-3">Contacto</th>
                <th className="px-6 py-3">Dirección</th>
                <th className="px-6 py-3">Editar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
              {clientesFiltrados.map(c => (
                <tr key={c.id} className="hover:bg-slate-50/40">
                  <td className="px-6 py-4 font-bold text-slate-900">{c.nombre}</td>
                  <td className="px-6 py-4 font-mono">{c.cedula}</td>
                  <td className="px-6 py-4">
                    <p>{c.telefono || "-"}</p>
                    <p className="text-[10px] text-slate-400">{c.email || ""}</p>
                  </td>
                  <td className="px-6 py-4 text-xs max-w-xs">
                    <p className="truncate">{c.direccion || "-"}</p>
                    {c.lat != null && c.lng != null ? (
                      <a href={`https://www.google.com/maps?q=${c.lat},${c.lng}`} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-emerald-600 hover:underline">
                        📍 Ver GPS
                      </a>
                    ) : (
                      <span className="text-[10px] font-semibold text-slate-300">Sin GPS</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <button type="button" title="Editar ficha completa" onClick={() => { setClienteEditar(c); setMsgModal(null); }} className="text-slate-400 hover:text-blue-600 text-base">✏️</button>
                  </td>
                </tr>
              ))}
              {clientesFiltrados.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-6 text-slate-400 font-medium">No hay clientes registrados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {clienteEditar && (
        <Modal titulo={`Editar Cliente: ${clienteEditar.nombre}`} onCerrar={() => setClienteEditar(null)}>
          <FormularioCliente key={clienteEditar.id} inicial={clienteAForm(clienteEditar)} onGuardar={guardarEdicion} msg={msgModal} />
        </Modal>
      )}
    </div>
  );
}

// --- Proveedores ---
const proveedorFormVacio = { rif: "", nombre: "", telefono: "", email: "", direccion: "" };

function proveedorAForm(p: Proveedor): typeof proveedorFormVacio {
  return { rif: p.rif, nombre: p.nombre, telefono: p.telefono || "", email: p.email || "", direccion: p.direccion || "" };
}

function FormularioProveedor({ inicial, onGuardar, msg }: { inicial: typeof proveedorFormVacio; onGuardar: (form: typeof proveedorFormVacio) => void; msg: Msg }) {
  const [form, setForm] = useState(inicial);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    onGuardar(form);
  }

  return (
    <>
      <MsgLine msg={msg} />
      <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
        <label className="flex flex-col">
          <span className={labelCls}>RIF del Proveedor</span>
          <input className={inputCls} value={form.rif} onChange={(e) => set("rif", e.target.value)} placeholder="J-12345678-9" required />
        </label>
        <label className="flex flex-col">
          <span className={labelCls}>Nombre Comercial / Razón Social</span>
          <input className={inputCls} value={form.nombre} onChange={(e) => set("nombre", e.target.value)} required />
        </label>
        <label className="flex flex-col">
          <span className={labelCls}>Teléfono</span>
          <input className={inputCls} value={form.telefono} onChange={(e) => set("telefono", e.target.value)} placeholder="+584141234567" />
        </label>
        <label className="flex flex-col">
          <span className={labelCls}>Email</span>
          <input type="email" className={inputCls} value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="proveedor@correo.com" />
        </label>
        <label className="col-span-2 flex flex-col">
          <span className={labelCls}>Dirección Comercial</span>
          <textarea className={inputCls} rows={2} value={form.direccion} onChange={(e) => set("direccion", e.target.value)} placeholder="Calle, Edificio, Zona Industrial..." />
        </label>
        <div className="col-span-2">
          <button type="submit" className={btnCls}>Guardar Proveedor</button>
        </div>
      </form>
    </>
  );
}

function FormProveedores() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [msg, setMsg] = useState<Msg>(null);
  const [proveedorEditar, setProveedorEditar] = useState<Proveedor | null>(null);
  const [msgModal, setMsgModal] = useState<Msg>(null);

  async function cargarProveedores() {
    try {
      const res = await apiClient.get<Proveedor[]>("/api/v1/proveedores");
      setProveedores(res.data);
    } catch {
      setProveedores([]);
    }
  }

  useEffect(() => {
    cargarProveedores();
  }, []);

  async function crear(form: typeof proveedorFormVacio) {
    setMsg(null);
    if (!form.rif.trim() || !form.nombre.trim()) {
      setMsg({ tipo: "error", texto: "RIF y Nombre son obligatorios." });
      return;
    }
    try {
      await apiClient.post("/api/v1/proveedores", {
        rif: form.rif.trim(),
        nombre: form.nombre.trim(),
        telefono: form.telefono.trim() || null,
        email: form.email.trim() || null,
        direccion: form.direccion.trim() || null,
      });
      setMsg({ tipo: "ok", texto: "Proveedor registrado correctamente." });
      cargarProveedores();
    } catch (err: any) {
      setMsg({ tipo: "error", texto: err.response?.data?.detail ?? "No se pudo registrar el proveedor." });
    }
  }

  async function guardarEdicion(form: typeof proveedorFormVacio) {
    if (!proveedorEditar) return;
    setMsgModal(null);
    if (!form.rif.trim() || !form.nombre.trim()) {
      setMsgModal({ tipo: "error", texto: "RIF y Nombre son obligatorios." });
      return;
    }
    try {
      await apiClient.put(`/api/v1/proveedores/${proveedorEditar.id}`, {
        rif: form.rif.trim(),
        nombre: form.nombre.trim(),
        telefono: form.telefono.trim() || null,
        email: form.email.trim() || null,
        direccion: form.direccion.trim() || null,
      });
      setProveedorEditar(null);
      cargarProveedores();
    } catch (err: any) {
      setMsgModal({ tipo: "error", texto: err.response?.data?.detail ?? "No se pudo actualizar el proveedor." });
    }
  }

  return (
    <div className="space-y-6">
      <div className={cardCls}>
        <div>
          <h3 className="text-xl font-black tracking-tight text-slate-900">Registrar Proveedor</h3>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Control de compras e inventario</p>
        </div>
        <FormularioProveedor key="nuevo" inicial={proveedorFormVacio} onGuardar={crear} msg={msg} />
      </div>

      <div className="rounded-3xl bg-white border border-slate-100 shadow-sm overflow-hidden p-6">
        <h4 className="text-sm font-black text-slate-950 uppercase tracking-wider mb-4">Proveedores Registrados</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold uppercase text-slate-400">
                <th className="px-6 py-3">Nombre</th>
                <th className="px-6 py-3">RIF</th>
                <th className="px-6 py-3">Contacto</th>
                <th className="px-6 py-3">Dirección</th>
                <th className="px-6 py-3">Editar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
              {proveedores.map(p => (
                <tr key={p.id} className="hover:bg-slate-50/40">
                  <td className="px-6 py-4 font-bold text-slate-900">{p.nombre}</td>
                  <td className="px-6 py-4 font-mono">{p.rif}</td>
                  <td className="px-6 py-4">
                    <p>{p.telefono || "-"}</p>
                    <p className="text-[10px] text-slate-400">{p.email || ""}</p>
                  </td>
                  <td className="px-6 py-4 text-xs max-w-xs truncate">{p.direccion || "-"}</td>
                  <td className="px-6 py-4">
                    <button type="button" title="Editar ficha completa" onClick={() => { setProveedorEditar(p); setMsgModal(null); }} className="text-slate-400 hover:text-blue-600 text-base">✏️</button>
                  </td>
                </tr>
              ))}
              {proveedores.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-6 text-slate-400 font-medium">No hay proveedores registrados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {proveedorEditar && (
        <Modal titulo={`Editar Proveedor: ${proveedorEditar.nombre}`} onCerrar={() => setProveedorEditar(null)}>
          <FormularioProveedor key={proveedorEditar.id} inicial={proveedorAForm(proveedorEditar)} onGuardar={guardarEdicion} msg={msgModal} />
        </Modal>
      )}
    </div>
  );
}

// --- Vehículos Delivery ---
const vehiculoFormVacio = { placa: "", marca: "", modelo: "", tipo: "Moto", status: "Operativo" };

function vehiculoAForm(v: Vehiculo): typeof vehiculoFormVacio {
  return { placa: v.placa, marca: v.marca, modelo: v.modelo, tipo: v.tipo, status: v.status };
}

function FormularioVehiculo({ inicial, onGuardar, msg }: { inicial: typeof vehiculoFormVacio; onGuardar: (form: typeof vehiculoFormVacio) => void; msg: Msg }) {
  const [form, setForm] = useState(inicial);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    onGuardar(form);
  }

  return (
    <>
      <MsgLine msg={msg} />
      <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
        <label className="flex flex-col">
          <span className={labelCls}>Placa</span>
          <input className={inputCls} value={form.placa} onChange={(e) => set("placa", e.target.value)} placeholder="Ej: AB123CD" required />
        </label>
        <label className="flex flex-col">
          <span className={labelCls}>Tipo de Vehículo</span>
          <select className={inputCls} value={form.tipo} onChange={(e) => set("tipo", e.target.value)}>
            {TIPOS_VEHICULO.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          <span className={labelCls}>Marca</span>
          <input className={inputCls} value={form.marca} onChange={(e) => set("marca", e.target.value)} placeholder="Ej: Yamaha, Suzuki, Toyota" required />
        </label>
        <label className="flex flex-col">
          <span className={labelCls}>Modelo</span>
          <input className={inputCls} value={form.modelo} onChange={(e) => set("modelo", e.target.value)} placeholder="Ej: YBR 125, GN 125" required />
        </label>
        <label className="flex flex-col col-span-2">
          <span className={labelCls}>Estatus Operativo</span>
          <select className={inputCls} value={form.status} onChange={(e) => set("status", e.target.value)}>
            {ESTATUS_VEHICULO.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <div className="col-span-2">
          <button type="submit" className={btnCls}>Guardar Vehículo</button>
        </div>
      </form>
    </>
  );
}

function FormVehiculos() {
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [msg, setMsg] = useState<Msg>(null);
  const [vehiculoEditar, setVehiculoEditar] = useState<Vehiculo | null>(null);
  const [msgModal, setMsgModal] = useState<Msg>(null);

  async function cargarVehiculos() {
    try {
      const res = await apiClient.get<Vehiculo[]>("/api/v1/vehiculos");
      setVehiculos(res.data);
    } catch {
      setVehiculos([]);
    }
  }

  useEffect(() => {
    cargarVehiculos();
  }, []);

  async function crear(form: typeof vehiculoFormVacio) {
    setMsg(null);
    if (!form.placa.trim() || !form.marca.trim() || !form.modelo.trim()) {
      setMsg({ tipo: "error", texto: "Placa, Marca y Modelo son obligatorios." });
      return;
    }
    try {
      await apiClient.post("/api/v1/vehiculos", {
        placa: form.placa.trim(),
        marca: form.marca.trim(),
        modelo: form.modelo.trim(),
        tipo: form.tipo,
        status: form.status,
      });
      setMsg({ tipo: "ok", texto: "Vehículo registrado correctamente." });
      cargarVehiculos();
    } catch (err: any) {
      setMsg({ tipo: "error", texto: err.response?.data?.detail ?? "No se pudo registrar el vehículo." });
    }
  }

  async function guardarEdicion(form: typeof vehiculoFormVacio) {
    if (!vehiculoEditar) return;
    setMsgModal(null);
    if (!form.placa.trim() || !form.marca.trim() || !form.modelo.trim()) {
      setMsgModal({ tipo: "error", texto: "Placa, Marca y Modelo son obligatorios." });
      return;
    }
    try {
      await apiClient.put(`/api/v1/vehiculos/${vehiculoEditar.id}`, {
        placa: form.placa.trim(),
        marca: form.marca.trim(),
        modelo: form.modelo.trim(),
        tipo: form.tipo,
        status: form.status,
      });
      setVehiculoEditar(null);
      cargarVehiculos();
    } catch (err: any) {
      setMsgModal({ tipo: "error", texto: err.response?.data?.detail ?? "No se pudo actualizar el vehículo." });
    }
  }

  return (
    <div className="space-y-6">
      <div className={cardCls}>
        <div>
          <h3 className="text-xl font-black tracking-tight text-slate-900">Registrar Unidad de Flota (Delivery)</h3>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Control logístico y despacho</p>
        </div>
        <FormularioVehiculo key="nuevo" inicial={vehiculoFormVacio} onGuardar={crear} msg={msg} />
      </div>

      <div className="rounded-3xl bg-white border border-slate-100 shadow-sm overflow-hidden p-6">
        <h4 className="text-sm font-black text-slate-950 uppercase tracking-wider mb-4">Unidades de Flota Activas</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold uppercase text-slate-400">
                <th className="px-6 py-3">Tipo</th>
                <th className="px-6 py-3">Placa</th>
                <th className="px-6 py-3">Vehículo</th>
                <th className="px-6 py-3 text-center">Estado</th>
                <th className="px-6 py-3">Editar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
              {vehiculos.map(v => (
                <tr key={v.id} className="hover:bg-slate-50/40">
                  <td className="px-6 py-4 font-bold text-slate-900">{v.tipo}</td>
                  <td className="px-6 py-4 font-mono">{v.placa}</td>
                  <td className="px-6 py-4">{v.marca} {v.modelo}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-2.5 py-1 rounded-xl text-xs font-bold border ${v.status === "Operativo" ? "bg-emerald-50 border-emerald-100 text-emerald-600" : v.status === "Mantenimiento" ? "bg-amber-50 border-amber-100 text-amber-600" : "bg-rose-50 border-rose-100 text-rose-600"}`}>
                      {v.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button type="button" title="Editar ficha completa" onClick={() => { setVehiculoEditar(v); setMsgModal(null); }} className="text-slate-400 hover:text-blue-600 text-base">✏️</button>
                  </td>
                </tr>
              ))}
              {vehiculos.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-6 text-slate-400 font-medium">No hay vehículos registrados en la flota.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {vehiculoEditar && (
        <Modal titulo={`Editar Vehículo: ${vehiculoEditar.placa}`} onCerrar={() => setVehiculoEditar(null)}>
          <FormularioVehiculo key={vehiculoEditar.id} inicial={vehiculoAForm(vehiculoEditar)} onGuardar={guardarEdicion} msg={msgModal} />
        </Modal>
      )}
    </div>
  );
}

// --- Usuarios y Roles ---
const usuarioFormVacio = { nombre: "", email: "", password: "", rol: "cajero", status: true };

function usuarioAForm(u: Empleado): typeof usuarioFormVacio {
  return { nombre: u.nombre, email: u.email, password: "", rol: u.rol, status: u.status };
}

function FormularioUsuario({ inicial, esEdicion, onGuardar, msg }: { inicial: typeof usuarioFormVacio; esEdicion: boolean; onGuardar: (form: typeof usuarioFormVacio) => void; msg: Msg }) {
  const [form, setForm] = useState(inicial);

  function set<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    onGuardar(form);
  }

  return (
    <>
      <MsgLine msg={msg} />
      <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
        <label className="flex flex-col">
          <span className={labelCls}>Nombre del Colaborador</span>
          <input className={inputCls} value={form.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Ej: Carlos Pérez" required />
        </label>
        <label className="flex flex-col">
          <span className={labelCls}>Rol / Cargo Operativo</span>
          <select className={inputCls} value={form.rol} onChange={(e) => set("rol", e.target.value)}>
            {CARGOS.map((c) => (
              <option key={c} value={c}>{c.toUpperCase()}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          <span className={labelCls}>Email de Acceso</span>
          <input type="email" className={inputCls} value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="carlos@minimarket.com" required />
        </label>
        <label className="flex flex-col">
          <span className={labelCls}>{esEdicion ? "Nueva Contraseña (dejar vacío para no cambiarla)" : "Contraseña Temporal"}</span>
          <input type="password" className={inputCls} value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="••••••••" required={!esEdicion} />
        </label>
        {esEdicion && (
          <label className="flex flex-col col-span-2">
            <span className={labelCls}>Estado de la Cuenta</span>
            <select className={inputCls} value={form.status ? "activo" : "inactivo"} onChange={(e) => set("status", e.target.value === "activo")}>
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
            </select>
          </label>
        )}
        <div className="col-span-2">
          <button type="submit" className={btnCls}>{esEdicion ? "Guardar Cambios" : "Guardar Credenciales"}</button>
        </div>
      </form>
    </>
  );
}

function FormUsuarios() {
  const [usuarios, setUsuarios] = useState<Empleado[]>([]);
  const [msg, setMsg] = useState<Msg>(null);
  const [accesoPermitido, setAccesoPermitido] = useState(true);
  const [usuarioEditar, setUsuarioEditar] = useState<Empleado | null>(null);
  const [msgModal, setMsgModal] = useState<Msg>(null);

  async function cargarUsuarios() {
    try {
      const res = await apiClient.get<Empleado[]>("/api/v1/usuarios");
      setUsuarios(res.data);
      setAccesoPermitido(true);
    } catch (err: any) {
      if (err.response?.status === 403) {
        setAccesoPermitido(false);
      }
      setUsuarios([]);
    }
  }

  useEffect(() => {
    cargarUsuarios();
  }, []);

  async function crear(form: typeof usuarioFormVacio) {
    setMsg(null);
    if (!form.nombre.trim() || !form.email.trim() || !form.password.trim()) {
      setMsg({ tipo: "error", texto: "Todos los campos son obligatorios." });
      return;
    }
    try {
      await apiClient.post("/api/v1/usuarios", {
        nombre: form.nombre.trim(),
        email: form.email.trim(),
        password: form.password.trim(),
        rol: form.rol,
        status: true,
      });
      setMsg({ tipo: "ok", texto: "Usuario/Empleado registrado correctamente." });
      cargarUsuarios();
    } catch (err: any) {
      setMsg({ tipo: "error", texto: err.response?.data?.detail ?? "No se pudo registrar el usuario." });
    }
  }

  async function guardarEdicion(form: typeof usuarioFormVacio) {
    if (!usuarioEditar) return;
    setMsgModal(null);
    if (!form.nombre.trim() || !form.email.trim()) {
      setMsgModal({ tipo: "error", texto: "Nombre y Email son obligatorios." });
      return;
    }
    try {
      const payload: Record<string, unknown> = {
        nombre: form.nombre.trim(),
        email: form.email.trim(),
        rol: form.rol,
        status: form.status,
      };
      if (form.password.trim()) payload.password = form.password.trim();
      await apiClient.put(`/api/v1/usuarios/${usuarioEditar.id}`, payload);
      setUsuarioEditar(null);
      cargarUsuarios();
    } catch (err: any) {
      setMsgModal({ tipo: "error", texto: err.response?.data?.detail ?? "No se pudo actualizar el usuario." });
    }
  }

  if (!accesoPermitido) {
    return (
      <div className="rounded-3xl border border-rose-100 bg-rose-50/50 p-8 text-center space-y-3">
        <span className="text-3xl">⚠️</span>
        <h3 className="text-lg font-black text-rose-600">Acceso Restringido</h3>
        <p className="text-sm text-slate-500 font-medium max-w-md mx-auto">
          Solo los usuarios con rol de **Propietario** o **Administrador** pueden gestionar los accesos, contraseñas y roles de la empresa.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className={cardCls}>
        <div>
          <h3 className="text-xl font-black tracking-tight text-slate-900">Registrar Credenciales de Usuario</h3>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Control de accesos y roles (RBAC)</p>
        </div>
        <FormularioUsuario key="nuevo" inicial={usuarioFormVacio} esEdicion={false} onGuardar={crear} msg={msg} />
      </div>

      <div className="rounded-3xl bg-white border border-slate-100 shadow-sm overflow-hidden p-6">
        <h4 className="text-sm font-black text-slate-950 uppercase tracking-wider mb-4">Usuarios Activos en la Empresa</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold uppercase text-slate-400">
                <th className="px-6 py-3">Nombre</th>
                <th className="px-6 py-3">Correo</th>
                <th className="px-6 py-3">Rol</th>
                <th className="px-6 py-3 text-center">Estado</th>
                <th className="px-6 py-3">Editar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
              {usuarios.map(u => (
                <tr key={u.id} className="hover:bg-slate-50/40">
                  <td className="px-6 py-4 font-bold text-slate-900">{u.nombre}</td>
                  <td className="px-6 py-4 font-mono text-xs text-slate-500">{u.email}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-0.5 rounded-lg text-xs font-bold uppercase bg-slate-100 text-slate-600">{u.rol}</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${u.status ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
                      {u.status ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button type="button" title="Editar ficha completa" onClick={() => { setUsuarioEditar(u); setMsgModal(null); }} className="text-slate-400 hover:text-blue-600 text-base">✏️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {usuarioEditar && (
        <Modal titulo={`Editar Usuario: ${usuarioEditar.nombre}`} onCerrar={() => setUsuarioEditar(null)}>
          <FormularioUsuario key={usuarioEditar.id} inicial={usuarioAForm(usuarioEditar)} esEdicion onGuardar={guardarEdicion} msg={msgModal} />
        </Modal>
      )}
    </div>
  );
}

// --- Componente Principal ---
export default function IngresoDatos() {
  const [tab, setTab] = useState<"clientes" | "productos" | "proveedores" | "usuarios" | "vehiculos" | "desposte">("clientes");
  const rol = getRolFromToken();

  // El tab de usuarios solo se expone en la UI si el rol es propietario o administrador
  const mostrarTabUsuarios = rol === "propietario" || rol === "administrador" || rol === "admin";

  return (
    <div className="p-6 space-y-6">
      <div className="rounded-3xl bg-slate-950 p-6 text-white border border-slate-800 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight">Consola de Ingreso de Datos</h2>
          <p className="text-xs text-slate-400 mt-0.5">Gestión y registro de variables operativas del ecosistema SaaS</p>
        </div>
        <div className="flex flex-wrap gap-1 bg-slate-900 p-1.5 rounded-2xl border border-slate-800 text-xs font-bold">
          <button
            type="button"
            onClick={() => setTab("clientes")}
            className={`px-4 py-2 rounded-xl transition-all ${tab === "clientes" ? "bg-blue-600 text-white shadow-md" : "text-slate-400 hover:text-white"}`}
          >
            👤 Clientes
          </button>
          <button
            type="button"
            onClick={() => setTab("productos")}
            className={`px-4 py-2 rounded-xl transition-all ${tab === "productos" ? "bg-blue-600 text-white shadow-md" : "text-slate-400 hover:text-white"}`}
          >
            🗂️ Productos
          </button>
          <button
            type="button"
            onClick={() => setTab("desposte")}
            className={`px-4 py-2 rounded-xl transition-all ${tab === "desposte" ? "bg-blue-600 text-white shadow-md" : "text-slate-400 hover:text-white"}`}
          >
            🥩 Desposte
          </button>
          <button
            type="button"
            onClick={() => setTab("proveedores")}
            className={`px-4 py-2 rounded-xl transition-all ${tab === "proveedores" ? "bg-blue-600 text-white shadow-md" : "text-slate-400 hover:text-white"}`}
          >
            🚚 Proveedores
          </button>
          <button
            type="button"
            onClick={() => setTab("vehiculos")}
            className={`px-4 py-2 rounded-xl transition-all ${tab === "vehiculos" ? "bg-blue-600 text-white shadow-md" : "text-slate-400 hover:text-white"}`}
          >
            🛵 Flota Delivery
          </button>
          {mostrarTabUsuarios && (
            <button
              type="button"
              onClick={() => setTab("usuarios")}
              className={`px-4 py-2 rounded-xl transition-all ${tab === "usuarios" ? "bg-blue-600 text-white shadow-md" : "text-slate-400 hover:text-white"}`}
            >
              🔑 Usuarios y Roles
            </button>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {tab === "clientes" && <FormClientes />}
        {tab === "productos" && (
          <div className="space-y-6">
            <FichaProducto />
            <ListadoProductos />
          </div>
        )}
        {tab === "proveedores" && <FormProveedores />}
        {tab === "vehiculos" && <FormVehiculos />}
        {tab === "usuarios" && <FormUsuarios />}
        {tab === "desposte" && <ModuloDesposte />}
      </div>
    </div>
  );
}