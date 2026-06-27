import { useEffect, useState } from "react";

export interface ReportePago {
  metodo: string;
  fecha: string;
  monto: number;
  referencia: string;
  recibo: string;
}

export interface SuscripcionState {
  empresaId: number;
  razonSocial: string;
  estado: "Activo" | "Suspendido";
  fechaVencimiento: string;
  reportePendiente: ReportePago | null;
}

const STORAGE_KEY = "saas_suscripcion";
const EVENT_NAME = "suscripcion-update";

// Suscripción de la empresa "propia" (tenant id=1) usada para demostrar
// la alerta temprana y el flujo de auto-reporte de pago end-to-end.
const DEFAULT_STATE: SuscripcionState = {
  empresaId: 1,
  razonSocial: "MiniMarket Barinas C.A.",
  estado: "Activo",
  fechaVencimiento: "2027-06-17",
  reportePendiente: null,
};

export function getSuscripcion(): SuscripcionState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const state = raw ? { ...DEFAULT_STATE, ...JSON.parse(raw) } : { ...DEFAULT_STATE };
    
    // Auto-habilitar si está vencido o vence hoy
    if (diasRestantes(state.fechaVencimiento) <= 0) {
      state.fechaVencimiento = addDias(new Date().toISOString().slice(0, 10), 30);
      state.estado = "Activo";
      state.reportePendiente = null;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
    return state;
  } catch {
    // Si falla, retornamos el default con fecha ajustada a futuro
    const fallback = { ...DEFAULT_STATE };
    fallback.fechaVencimiento = addDias(new Date().toISOString().slice(0, 10), 30);
    return fallback;
  }
}

export function setSuscripcion(state: SuscripcionState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function useSuscripcion(): [SuscripcionState, (state: SuscripcionState) => void] {
  const [state, setState] = useState<SuscripcionState>(getSuscripcion);

  useEffect(() => {
    const onUpdate = () => setState(getSuscripcion());
    window.addEventListener(EVENT_NAME, onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener(EVENT_NAME, onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, []);

  return [state, setSuscripcion];
}

// Días restantes hasta el vencimiento (negativo si ya venció)
export function diasRestantes(fechaVencimiento: string): number {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(`${fechaVencimiento}T00:00:00`);
  return Math.ceil((venc.getTime() - hoy.getTime()) / 86400000);
}

export function addDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}
