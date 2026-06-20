import { useSuscripcion, diasRestantes } from "../state/suscripcion";

export default function BannerVencimiento({ onReportar }: { onReportar: () => void }) {
  const [suscripcion] = useSuscripcion();

  if (suscripcion.estado !== "Activo") return null;

  const dias = diasRestantes(suscripcion.fechaVencimiento);
  if (dias > 5) return null;

  const texto = dias <= 0 ? "vence HOY" : `vence en ${dias} día${dias === 1 ? "" : "s"}`;

  return (
    <div className="bg-amber-500 text-white font-semibold px-6 py-3 flex justify-between items-center animate-pulse shadow-md">
      <span>⚠️ ATENCIÓN: Tu suscripción de SaaS MiniMarket {texto}. Evita interrupciones en tus cajas de cobro.</span>
      <button
        type="button"
        onClick={onReportar}
        className="bg-white text-amber-600 rounded-full px-4 py-1 text-xs font-bold hover:bg-slate-100 transition"
      >
        Reportar Pago Ahora
      </button>
    </div>
  );
}
