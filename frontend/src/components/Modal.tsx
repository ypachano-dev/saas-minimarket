import type { ReactNode } from "react";

export default function Modal({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/60 p-4 overflow-y-auto" onClick={onCerrar}>
      <div
        className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl my-8 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50 sticky top-0">
          <h3 className="text-lg font-black text-slate-900">{titulo}</h3>
          <button
            type="button"
            onClick={onCerrar}
            className="text-slate-400 hover:text-slate-700 text-xl font-bold leading-none px-2"
          >
            ✕
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
