export default function PlaceholderModulo({ titulo, pendientes }: { titulo: string; pendientes: string[] }) {
  return (
    <div className="bg-white rounded-3xl p-8 shadow-sm">
      <h2 className="text-3xl font-black tracking-tight text-slate-900">{titulo}</h2>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Módulo en construcción</p>
      {pendientes.length > 0 && (
        <ul className="mt-6 space-y-2">
          {pendientes.map((p) => (
            <li key={p} className="flex items-center gap-2 text-sm text-slate-600">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
              {p}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
