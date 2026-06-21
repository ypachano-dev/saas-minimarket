import { hoyISO, primerDiaMesActual, primerDiaMesAnterior, ultimoDiaMesAnterior, haceNDias } from "../lib/fechas";

interface SelectorRangoFechasProps {
  desde: string;
  hasta: string;
  onChange: (desde: string, hasta: string) => void;
  presets?: boolean;
}

export default function SelectorRangoFechas({ desde, hasta, onChange, presets = true }: SelectorRangoFechasProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="date"
        value={desde}
        max={hasta}
        onChange={(e) => onChange(e.target.value, hasta)}
        className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <span className="text-xs text-slate-400 font-bold">→</span>
      <input
        type="date"
        value={hasta}
        min={desde}
        max={hoyISO()}
        onChange={(e) => onChange(desde, e.target.value)}
        className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {presets && (
        <div className="flex gap-1.5">
          <button type="button" onClick={() => onChange(primerDiaMesActual(), hoyISO())} className="text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded-full transition-colors">
            Mes en curso
          </button>
          <button type="button" onClick={() => onChange(haceNDias(30), hoyISO())} className="text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded-full transition-colors">
            Últimos 30 días
          </button>
          <button type="button" onClick={() => onChange(primerDiaMesAnterior(), ultimoDiaMesAnterior())} className="text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded-full transition-colors">
            Mes anterior
          </button>
        </div>
      )}
    </div>
  );
}
