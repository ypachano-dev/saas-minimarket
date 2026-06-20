import { useState, useEffect, type FormEvent } from "react";
import apiClient from "../api/client";

interface Proveedor { id: number; nombre: string; rif: string; }
interface Producto { id: number; codigo_interno: string; nombre: string; }
interface OrdenCompra { id: number; proveedor: string; total_usd: number; estatus: string; }

interface RenglonForm {
  producto_id: string;
  cantidad: string;
  costo_unitario: string;
  codigo_lote: string;
  fecha_vencimiento: string;
}

interface Recepcion {
  id: number;
  proveedor_nombre: string | null;
  orden_compra_id: number | null;
  fecha: string;
  notas: string | null;
  items: { id: number; producto_id: number; cantidad: number; costo_unitario: number }[];
}

const inputCls = "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const labelCls = "text-xs font-semibold uppercase tracking-wider text-slate-400";
const fmt = (n: number | string) => Number(n).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const renglonVacio = (): RenglonForm => ({ producto_id: "", cantidad: "", costo_unitario: "", codigo_lote: "", fecha_vencimiento: "" });

export default function AlmacenIngreso() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [ordenesPendientes, setOrdenesPendientes] = useState<OrdenCompra[]>([]);
  const [recepciones, setRecepciones] = useState<Recepcion[]>([]);

  const [proveedorId, setProveedorId] = useState("");
  const [ordenCompraId, setOrdenCompraId] = useState("");
  const [notas, setNotas] = useState("");
  const [renglones, setRenglones] = useState<RenglonForm[]>([renglonVacio()]);
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  function cargarTodo() {
    apiClient.get<Proveedor[]>("/api/v1/proveedores").then((res) => setProveedores(res.data)).catch(() => {});
    apiClient.get<Producto[]>("/api/v1/productos").then((res) => setProductos(res.data)).catch(() => {});
    apiClient.get<OrdenCompra[]>("/api/v1/pedidos/ordenes").then((res) => {
      setOrdenesPendientes(res.data.filter((o) => o.estatus === "Pendiente"));
    }).catch(() => {});
    apiClient.get<Recepcion[]>("/api/v1/almacen/recepciones").then((res) => setRecepciones(res.data)).catch(() => {});
  }

  useEffect(() => { cargarTodo(); }, []);

  function actualizarRenglon(idx: number, campo: keyof RenglonForm, valor: string) {
    setRenglones((prev) => prev.map((r, i) => (i === idx ? { ...r, [campo]: valor } : r)));
  }

  function agregarRenglon() {
    setRenglones((prev) => [...prev, renglonVacio()]);
  }

  function quitarRenglon(idx: number) {
    setRenglones((prev) => prev.filter((_, i) => i !== idx));
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setMsg(null);

    const renglonesValidos = renglones.filter((r) => r.producto_id && r.cantidad && r.costo_unitario && r.codigo_lote && r.fecha_vencimiento);
    if (renglonesValidos.length === 0) {
      setMsg({ tipo: "error", texto: "Debe completar al menos un renglón con producto, cantidad, costo, código de lote y fecha de vencimiento." });
      return;
    }

    setGuardando(true);
    try {
      await apiClient.post("/api/v1/almacen/recepciones", {
        proveedor_id: proveedorId ? Number(proveedorId) : undefined,
        orden_compra_id: ordenCompraId ? Number(ordenCompraId) : undefined,
        notas: notas.trim() || undefined,
        items: renglonesValidos.map((r) => ({
          producto_id: Number(r.producto_id),
          cantidad: Number(r.cantidad),
          costo_unitario: Number(r.costo_unitario),
          codigo_lote: r.codigo_lote.trim(),
          fecha_vencimiento: r.fecha_vencimiento,
        })),
      });
      setMsg({ tipo: "ok", texto: "Mercancía recibida e ingresada al inventario correctamente." });
      setProveedorId("");
      setOrdenCompraId("");
      setNotas("");
      setRenglones([renglonVacio()]);
      cargarTodo();
    } catch (err: any) {
      setMsg({ tipo: "error", texto: err.response?.data?.detail ?? "No se pudo registrar la recepción." });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-6">
      {msg && (
        <p className={`text-sm font-medium px-4 py-2 rounded-xl ${msg.tipo === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
          {msg.texto}
        </p>
      )}

      <form onSubmit={guardar} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-5">
        <h3 className="text-lg font-bold text-slate-900">📥 Recibir Mercancía (Ingreso / Descarga)</h3>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col">
            <span className={labelCls}>Proveedor (opcional)</span>
            <select className={inputCls} value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
              <option value="">Sin proveedor / compra local</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre} ({p.rif})</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col">
            <span className={labelCls}>Orden de Compra a cubrir (opcional)</span>
            <select className={inputCls} value={ordenCompraId} onChange={(e) => setOrdenCompraId(e.target.value)}>
              <option value="">Ninguna / recepción libre</option>
              {ordenesPendientes.map((o) => (
                <option key={o.id} value={o.id}>OC-{o.id} · {o.proveedor} · ${fmt(o.total_usd)}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className={labelCls}>Productos Recibidos</span>
            <button type="button" onClick={agregarRenglon} className="text-xs text-blue-600 hover:text-blue-700 font-bold bg-blue-50 px-3 py-1.5 rounded-xl">
              + Agregar producto
            </button>
          </div>

          {renglones.map((r, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-end bg-slate-50/50 p-3 rounded-2xl border border-slate-100">
              <label className="col-span-3 flex flex-col">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Producto</span>
                <select className={inputCls} value={r.producto_id} onChange={(e) => actualizarRenglon(idx, "producto_id", e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {productos.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </label>
              <label className="col-span-2 flex flex-col">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Cantidad</span>
                <input type="number" step="0.001" className={inputCls} value={r.cantidad} onChange={(e) => actualizarRenglon(idx, "cantidad", e.target.value)} placeholder="0.000" />
              </label>
              <label className="col-span-2 flex flex-col">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Costo Unit. ($)</span>
                <input type="number" step="0.0001" className={inputCls} value={r.costo_unitario} onChange={(e) => actualizarRenglon(idx, "costo_unitario", e.target.value)} placeholder="0.00" />
              </label>
              <label className="col-span-2 flex flex-col">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Código de Lote</span>
                <input className={inputCls} value={r.codigo_lote} onChange={(e) => actualizarRenglon(idx, "codigo_lote", e.target.value)} placeholder="LOTE-001" />
              </label>
              <label className="col-span-2 flex flex-col">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Vence</span>
                <input type="date" className={inputCls} value={r.fecha_vencimiento} onChange={(e) => actualizarRenglon(idx, "fecha_vencimiento", e.target.value)} />
              </label>
              <div className="col-span-1 flex justify-center pb-2">
                {renglones.length > 1 && (
                  <button type="button" onClick={() => quitarRenglon(idx)} className="text-rose-500 hover:bg-rose-50 rounded-lg p-2 text-xs font-bold">✕</button>
                )}
              </div>
            </div>
          ))}
        </div>

        <label className="flex flex-col">
          <span className={labelCls}>Notas</span>
          <textarea className={inputCls} rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej. Entrega parcial, factura #..." />
        </label>

        <button type="submit" disabled={guardando} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-2xl py-3 text-sm font-bold transition-all disabled:opacity-50">
          {guardando ? "Guardando..." : "📥 Registrar Recepción de Mercancía"}
        </button>
      </form>

      <section className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 mb-3">📜 Historial de Recepciones</h3>
        {recepciones.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-6">Sin recepciones registradas todavía.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {recepciones.map((r) => (
              <div key={r.id} className="py-3 flex items-center justify-between text-sm">
                <div>
                  <p className="font-semibold text-slate-700">{r.proveedor_nombre ?? "Compra local"} {r.orden_compra_id && `· OC-${r.orden_compra_id}`}</p>
                  <p className="text-[11px] text-slate-400">{new Date(r.fecha).toLocaleDateString("es-VE")} · {r.items.length} producto(s)</p>
                </div>
                <span className="font-mono font-bold text-slate-700">
                  ${fmt(r.items.reduce((acc, i) => acc + Number(i.cantidad) * Number(i.costo_unitario), 0))}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
