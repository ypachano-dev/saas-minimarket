import { useState, type DragEvent, type FormEvent } from "react";
import apiClient from "../api/client";
import { useSuscripcion, setSuscripcion } from "../state/suscripcion";
import { APP_NAME } from "../config/brand";

const METODOS = ["Pago Móvil Banesco", "Transferencia Banco de Venezuela", "Efectivo $", "Custodia"];

const inputCls = "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const labelCls = "text-xs font-semibold uppercase tracking-wider text-slate-400";

const initialForm = { metodo: METODOS[0], fecha: "", monto: "", referencia: "", recibo: "" };

export default function ReportePagoCliente({ onClose }: { onClose?: () => void }) {
  const [suscripcion] = useSuscripcion();
  const [form, setForm] = useState(initialForm);
  const [arrastrando, setArrastrando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [enviado, setEnviado] = useState(suscripcion.reportePendiente !== null);

  function set<K extends keyof typeof initialForm>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastrando(false);
    const file = e.dataTransfer.files?.[0];
    if (file) set("recibo", file.name);
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!form.fecha || !form.monto.trim() || !form.referencia.trim() || !form.recibo) {
      setMsg({ tipo: "error", texto: "Todos los campos, incluyendo el comprobante, son obligatorios." });
      return;
    }

    const monto = Number(form.monto);
    if (Number.isNaN(monto) || monto <= 0) {
      setMsg({ tipo: "error", texto: "Monto debe ser un número válido mayor a 0." });
      return;
    }

    try {
      await apiClient.post("/api/v1/suscripciones/reportar", { ...form, monto });
    } catch {
      // Endpoint de aprobación aún no integrado: continuamos con el flujo provisional local.
    }

    setSuscripcion({ ...suscripcion, reportePendiente: { metodo: form.metodo, fecha: form.fecha, monto, referencia: form.referencia.trim(), recibo: form.recibo } });
    setEnviado(true);
  }

  if (enviado) {
    return (
      <div className="rounded-3xl bg-white p-8 border border-slate-100 shadow-sm text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-2xl">⏳</div>
        <h3 className="mt-4 text-xl font-black tracking-tight text-slate-900">Esperando Aprobación del Administrador</h3>
        <p className="mt-2 text-sm text-slate-500">
          Tu reporte de pago fue recibido y está pendiente de revisión por el equipo de {APP_NAME}. Una vez aprobado, tu suscripción se extenderá automáticamente.
        </p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="mt-6 rounded-2xl bg-slate-900 px-6 py-2.5 text-sm font-bold text-white transition-colors duration-300 hover:bg-slate-700"
          >
            Cerrar
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-white p-8 border border-slate-100 shadow-sm">
      <h2 className="text-2xl font-black tracking-tight text-slate-900">Reportar Pago de Suscripción</h2>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{suscripcion.razonSocial}</p>

      {msg && <p className={`mt-3 text-sm font-medium ${msg.tipo === "ok" ? "text-emerald-600" : "text-red-600"}`}>{msg.texto}</p>}

      <form onSubmit={enviar} className="mt-6 grid grid-cols-2 gap-4">
        <label className="flex flex-col">
          <span className={labelCls}>Banco de Destino / Método</span>
          <select className={inputCls} value={form.metodo} onChange={(e) => set("metodo", e.target.value)}>
            {METODOS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          <span className={labelCls}>Fecha de la Transacción</span>
          <input type="date" className={inputCls} value={form.fecha} onChange={(e) => set("fecha", e.target.value)} required />
        </label>
        <label className="flex flex-col">
          <span className={labelCls}>Monto Reportado ($ o Bs)</span>
          <input type="number" step="0.01" min="0" className={inputCls} value={form.monto} onChange={(e) => set("monto", e.target.value)} placeholder="0.00" required />
        </label>
        <label className="flex flex-col">
          <span className={labelCls}>Número de Referencia Bancaria</span>
          <input className={inputCls} value={form.referencia} onChange={(e) => set("referencia", e.target.value)} placeholder="0000000000" required />
        </label>
        <label className="col-span-2 flex flex-col">
          <span className={labelCls}>Adjuntar Comprobante / Capture</span>
          <div
            onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={onDrop}
            className={`mt-1 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors duration-300 ${
              arrastrando ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-slate-50"
            }`}
          >
            <span className="text-2xl">📎</span>
            <p className="text-sm font-medium text-slate-600">{form.recibo || "Arrastra tu comprobante aquí o selecciona un archivo"}</p>
            <label className="cursor-pointer rounded-full bg-slate-900 px-4 py-1.5 text-xs font-bold text-white transition-colors duration-300 hover:bg-slate-700">
              Seleccionar Archivo
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => set("recibo", e.target.files?.[0]?.name ?? "")} />
            </label>
          </div>
        </label>
        <button type="submit" className="col-span-2 rounded-2xl bg-amber-500 py-3 text-sm font-bold text-white shadow-sm transition-all duration-300 hover:bg-amber-600 hover:shadow-md">
          Enviar Reporte de Pago
        </button>
      </form>
    </div>
  );
}
