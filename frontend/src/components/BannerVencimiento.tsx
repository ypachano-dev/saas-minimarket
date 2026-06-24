import { useSuscripcion, diasRestantes } from "../state/suscripcion";

export default function BannerVencimiento({ onReportar }: { onReportar: () => void }) {
  const [suscripcion] = useSuscripcion();

  if (suscripcion.estado !== "Activo") return null;

  const dias = diasRestantes(suscripcion.fechaVencimiento);
  if (dias > 5) return null;

  const texto = dias <= 0 ? "vence HOY" : `vence en ${dias} día${dias === 1 ? "" : "s"}`;
  const urgente = dias <= 1;

  return (
    <div className="relative px-4 pt-3">
      <div
        className={`relative overflow-hidden flex justify-between items-center gap-3 rounded-2xl px-5 py-2.5 shadow-xl border backdrop-blur-md ${
          urgente
            ? "bg-gradient-to-r from-rose-600/95 to-amber-600/95 border-rose-400/30 glow-pulse-amber"
            : "bg-gradient-to-r from-amber-500/95 to-orange-500/95 border-amber-300/30"
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
          </span>
          <p className="text-white text-sm font-semibold tracking-tight truncate">
            <span className="font-black uppercase text-[11px] tracking-wider mr-1.5 opacity-90">Suscripción</span>
            Tu plan de SaaS MiniMarket {texto}. Evita interrupciones en tus cajas de cobro.
          </p>
        </div>
        <button
          type="button"
          onClick={onReportar}
          className="shrink-0 bg-white/95 hover:bg-white text-amber-700 rounded-full px-4 py-1.5 text-xs font-bold shadow-lg transition-all hover:scale-105 active:scale-95"
        >
          Reportar Pago
        </button>
      </div>
    </div>
  );
}
