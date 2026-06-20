import { useState, type FormEvent, useEffect } from "react";
import apiClient from "../api/client";
import FichaProducto from "./FichaProducto";
import ModuloDesposte from "./ModuloDesposte";

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

// --- Clientes ---
function FormClientes() {
  const [form, setForm] = useState({ tipo: "V", cedula: "", nombre: "", telefono: "", email: "", direccion: "", instagram: "", telegram: "" });
  const [msg, setMsg] = useState<Msg>(null);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
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
      });
      setMsg({ tipo: "ok", texto: "Cliente registrado correctamente." });
      setForm({ tipo: "V", cedula: "", nombre: "", telefono: "", email: "", direccion: "", instagram: "", telegram: "" });
    } catch (err: any) {
      const detalle = err.response?.data?.detail ?? "No se pudo registrar el cliente.";
      setMsg({ tipo: "error", texto: detalle });
    }
  }

  return (
    <div className={cardCls}>
      <div>
        <h3 className="text-xl font-black tracking-tight text-slate-900">Registrar Nuevo Cliente</h3>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Control de cartera de clientes</p>
      </div>
      <MsgLine msg={msg} />
      <form onSubmit={guardar} className="grid grid-cols-2 gap-4">
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
        <div className="col-span-2">
          <button type="submit" className={btnCls}>Guardar Cliente</button>
        </div>
      </form>
    </div>
  );
}

// --- Proveedores ---
function FormProveedores() {
  const [form, setForm] = useState({ rif: "", nombre: "", telefono: "", email: "", direccion: "" });
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [msg, setMsg] = useState<Msg>(null);

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

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
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
      setForm({ rif: "", nombre: "", telefono: "", email: "", direccion: "" });
      cargarProveedores();
    } catch (err: any) {
      const detalle = err.response?.data?.detail ?? "No se pudo registrar el proveedor.";
      setMsg({ tipo: "error", texto: detalle });
    }
  }

  return (
    <div className="space-y-6">
      <div className={cardCls}>
        <div>
          <h3 className="text-xl font-black tracking-tight text-slate-900">Registrar Proveedor</h3>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Control de compras e inventario</p>
        </div>
        <MsgLine msg={msg} />
        <form onSubmit={guardar} className="grid grid-cols-2 gap-4">
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
                </tr>
              ))}
              {proveedores.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-6 text-slate-400 font-medium">No hay proveedores registrados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- Vehículos Delivery ---
function FormVehiculos() {
  const [form, setForm] = useState({ placa: "", marca: "", modelo: "", tipo: "Moto", status: "Operativo" });
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [msg, setMsg] = useState<Msg>(null);

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

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
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
      setForm({ placa: "", marca: "", modelo: "", tipo: "Moto", status: "Operativo" });
      cargarVehiculos();
    } catch (err: any) {
      const detalle = err.response?.data?.detail ?? "No se pudo registrar el vehículo.";
      setMsg({ tipo: "error", texto: detalle });
    }
  }

  return (
    <div className="space-y-6">
      <div className={cardCls}>
        <div>
          <h3 className="text-xl font-black tracking-tight text-slate-900">Registrar Unidad de Flota (Delivery)</h3>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Control logístico y despacho</p>
        </div>
        <MsgLine msg={msg} />
        <form onSubmit={guardar} className="grid grid-cols-2 gap-4">
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
                </tr>
              ))}
              {vehiculos.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-6 text-slate-400 font-medium">No hay vehículos registrados en la flota.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- Usuarios y Roles ---
function FormUsuarios() {
  const [form, setForm] = useState({ nombre: "", email: "", password: "", rol: "cajero" });
  const [usuarios, setUsuarios] = useState<Empleado[]>([]);
  const [msg, setMsg] = useState<Msg>(null);
  const [accesoPermitido, setAccesoPermitido] = useState(true);

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

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
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
      setForm({ nombre: "", email: "", password: "", rol: "cajero" });
      cargarUsuarios();
    } catch (err: any) {
      const detalle = err.response?.data?.detail ?? "No se pudo registrar el usuario.";
      setMsg({ tipo: "error", texto: detalle });
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
        <MsgLine msg={msg} />
        <form onSubmit={guardar} className="grid grid-cols-2 gap-4">
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
            <span className={labelCls}>Contraseña Temporal</span>
            <input type="password" className={inputCls} value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="••••••••" required />
          </label>
          <div className="col-span-2">
            <button type="submit" className={btnCls}>Guardar Credenciales</button>
          </div>
        </form>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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
        {tab === "productos" && <FichaProducto />}
        {tab === "proveedores" && <FormProveedores />}
        {tab === "vehiculos" && <FormVehiculos />}
        {tab === "usuarios" && <FormUsuarios />}
        {tab === "desposte" && <ModuloDesposte />}
      </div>
    </div>
  );
}