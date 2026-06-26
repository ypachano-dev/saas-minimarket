import { FIRMA_PROVEEDOR } from "../config/brand";
import type { TamanoPapel } from "./TicketTermico";

export interface DesgloseMetodoVM {
  metodo_pago: string;
  monto_usd: number;
  monto_ves: number;
}

export interface TurnoCajaVM {
  id: number;
  usuario_id: number;
  cajero_nombre: string | null;
  estado: "ABIERTO" | "CERRADO";
  fecha_apertura: string;
  fecha_cierre: string | null;
  monto_inicial_usd: number;
  monto_inicial_ves: number;
  monto_esperado_usd: number;
  monto_esperado_ves: number;
  monto_real_usd: number | null;
  monto_real_ves: number | null;
  descuadre_usd: number | null;
  descuadre_ves: number | null;
  desglose_metodos: DesgloseMetodoVM[];
}

const fmt = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function etiquetaDescuadre(valor: number): string {
  if (valor < 0) return `Faltante: -$${fmt(Math.abs(valor))}`;
  if (valor > 0) return `Sobrante: +$${fmt(valor)}`;
  return "Cuadrado: $0.00";
}

/** Comprobante térmico de arqueo de caja, impreso al cerrar un turno. Reutiliza
 * el mismo tamaño de papel configurado por el inquilino para los tickets de venta. */
export default function TicketArqueoCaja({ tamanoPapel, turno }: { tamanoPapel: TamanoPapel; turno: TurnoCajaVM }) {
  return (
    <div
      style={{ width: tamanoPapel }}
      className="mx-auto bg-white border border-dashed border-slate-300 p-3 font-mono text-[10.5px] text-slate-800 leading-tight"
    >
      <div className="text-center space-y-0.5">
        <p className="font-black text-[12px] uppercase tracking-tight">Arqueo de Caja</p>
        <p className="text-[9px] text-slate-500">Turno #{turno.id}</p>
      </div>

      <div className="border-t border-dashed border-slate-300 my-1.5" />

      <p className="text-[9px] text-slate-500">CAJERO: {turno.cajero_nombre ?? `Usuario #${turno.usuario_id}`}</p>
      <p className="text-[9px] text-slate-500">APERTURA: {new Date(turno.fecha_apertura).toLocaleString("es-VE")}</p>
      <p className="text-[9px] text-slate-500">CIERRE: {turno.fecha_cierre ? new Date(turno.fecha_cierre).toLocaleString("es-VE") : "—"}</p>

      <div className="border-t border-dashed border-slate-300 my-1.5" />

      <p className="text-[9px] font-bold text-slate-600 uppercase">Desglose por método (esperado)</p>
      <div className="space-y-0.5 mt-0.5">
        {turno.desglose_metodos.map((linea) => (
          <div key={linea.metodo_pago} className="flex justify-between">
            <span className="truncate pr-2">{linea.metodo_pago}</span>
            <span>{linea.metodo_pago === "Efectivo Bs" ? `Bs. ${fmt(linea.monto_ves)}` : `$${fmt(linea.monto_usd)}`}</span>
          </div>
        ))}
      </div>

      <div className="border-t border-dashed border-slate-300 my-1.5" />

      <div className="flex justify-between">
        <span>Fondo Inicial USD:</span>
        <span>${fmt(turno.monto_inicial_usd)}</span>
      </div>
      <div className="flex justify-between">
        <span>Fondo Inicial VES:</span>
        <span>Bs. {fmt(turno.monto_inicial_ves)}</span>
      </div>

      <div className="border-t border-dashed border-slate-300 my-1.5" />

      <div className="flex justify-between font-black">
        <span>Esperado USD:</span>
        <span>${fmt(turno.monto_esperado_usd)}</span>
      </div>
      <div className="flex justify-between font-black">
        <span>Real USD:</span>
        <span>${fmt(turno.monto_real_usd ?? 0)}</span>
      </div>
      <div className="flex justify-between text-[11px] font-black text-rose-600">
        <span>{etiquetaDescuadre(turno.descuadre_usd ?? 0)}</span>
      </div>

      <div className="border-t border-dashed border-slate-300/60 my-1" />

      <div className="flex justify-between font-black">
        <span>Esperado VES:</span>
        <span>Bs. {fmt(turno.monto_esperado_ves)}</span>
      </div>
      <div className="flex justify-between font-black">
        <span>Real VES:</span>
        <span>Bs. {fmt(turno.monto_real_ves ?? 0)}</span>
      </div>
      <div className="flex justify-between text-[11px] font-black text-rose-600">
        <span>{etiquetaDescuadre(turno.descuadre_ves ?? 0).replace("$", "Bs. ")}</span>
      </div>

      <div className="border-t border-dashed border-slate-300 my-1.5" />
      <p className="text-center text-[8px] text-slate-400">{FIRMA_PROVEEDOR}</p>
    </div>
  );
}
