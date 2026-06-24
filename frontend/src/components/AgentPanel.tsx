import { useState, useEffect, useRef } from "react";
import apiClient from "../api/client";

interface Mensaje {
  rol: "usuario" | "agente";
  texto: string;
  fuente?: "ia" | "reglas";
}

interface AgentPanelProps {
  nombre: string;
  rolDescripcion: string;
  avatarEmoji: string;
  colorTema: "violet" | "emerald" | "blue";
  apiPath: string; // ej. "/api/v1/agentes/vale"
  saludoInicial: string;
  placeholder?: string;
  // Si se provee, se llama automáticamente al montar (pidiendo el análisis inicial sin pregunta)
  autoIniciar?: boolean;
  // Campos extra que se mezclan en cada request (ej. { cliente_id } para ALO). Si cambia el
  // cliente, el padre debe remontar este panel con una key distinta para reiniciar la conversación.
  extraBody?: Record<string, any>;
  // Chips de preguntas/acciones frecuentes sobre las que el usuario puede hacer clic en vez de escribir
  accionesRapidas?: string[];
}

const TEMAS = {
  violet: {
    badge: "bg-gradient-to-br from-violet-500 to-indigo-600 text-white border-transparent shadow-lg shadow-violet-500/30",
    boton: "bg-gradient-to-br from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-lg shadow-violet-500/30",
    burbuja: "bg-gradient-to-br from-violet-50 to-indigo-50/60 border-violet-100 text-violet-900",
    encabezado: "from-violet-50/80 via-white to-white",
    barraSuperior: "from-violet-500 to-indigo-500",
  },
  emerald: {
    badge: "bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-transparent shadow-lg shadow-emerald-500/30",
    boton: "bg-gradient-to-br from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-500/30",
    burbuja: "bg-gradient-to-br from-emerald-50 to-teal-50/60 border-emerald-100 text-emerald-900",
    encabezado: "from-emerald-50/80 via-white to-white",
    barraSuperior: "from-emerald-500 to-teal-500",
  },
  blue: {
    badge: "bg-gradient-to-br from-blue-500 to-cyan-600 text-white border-transparent shadow-lg shadow-blue-500/30",
    boton: "bg-gradient-to-br from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg shadow-blue-500/30",
    burbuja: "bg-gradient-to-br from-blue-50 to-cyan-50/60 border-blue-100 text-blue-900",
    encabezado: "from-blue-50/80 via-white to-white",
    barraSuperior: "from-blue-500 to-cyan-500",
  },
};

export default function AgentPanel({
  nombre,
  rolDescripcion,
  avatarEmoji,
  colorTema,
  apiPath,
  saludoInicial,
  placeholder = "Pregúntale algo...",
  autoIniciar = false,
  extraBody,
  accionesRapidas,
}: AgentPanelProps) {
  const tema = TEMAS[colorTema];
  const [mensajes, setMensajes] = useState<Mensaje[]>([{ rol: "agente", texto: saludoInicial }]);
  const [pregunta, setPregunta] = useState("");
  const [cargando, setCargando] = useState(false);
  const yaAutoIniciado = useRef(false);

  useEffect(() => {
    if (autoIniciar && !yaAutoIniciado.current) {
      yaAutoIniciado.current = true;
      enviar("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function enviar(preguntaOverride?: string) {
    const texto = (preguntaOverride ?? pregunta).trim();
    setCargando(true);
    if (texto) {
      setMensajes((prev) => [...prev, { rol: "usuario", texto }]);
    }
    setPregunta("");

    try {
      const { data } = await apiClient.post<{ agente: string; respuesta: string; fuente: string }>(apiPath, {
        pregunta: texto || undefined,
        ...extraBody,
      });
      setMensajes((prev) => [...prev, { rol: "agente", texto: data.respuesta, fuente: data.fuente as "ia" | "reglas" }]);
    } catch (err: any) {
      setMensajes((prev) => [...prev, { rol: "agente", texto: err.response?.data?.detail ?? `${nombre} no pudo responder en este momento.` }]);
    } finally {
      setCargando(false);
    }
  }

  return (
    <section className="relative glass-card rounded-3xl shadow-2xl border border-slate-100/80 flex flex-col h-full overflow-hidden">
      <div className={`absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r ${tema.barraSuperior}`} />

      <div className={`flex items-center gap-3 p-4 border-b border-slate-100/70 bg-gradient-to-r ${tema.encabezado}`}>
        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl border ${tema.badge}`}>
          {avatarEmoji}
        </div>
        <div className="min-w-0">
          <h3 className="font-black text-slate-900 text-sm flex items-center gap-1.5">
            {nombre}
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
          </h3>
          <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider truncate">{rolDescripcion}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-80 min-h-[160px] scrollbar-thin-custom">
        {mensajes.map((m, idx) => (
          <div key={idx} className={`flex ${m.rol === "usuario" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${
                m.rol === "usuario" ? "bg-gradient-to-br from-slate-900 to-slate-700 text-white" : `border ${tema.burbuja}`
              }`}
            >
              <p className="whitespace-pre-wrap leading-relaxed">{m.texto}</p>
              {m.fuente === "reglas" && (
                <p className="text-[9px] mt-1.5 opacity-60 font-semibold uppercase tracking-wider">⚙️ Respuesta basada en reglas (sin IA configurada)</p>
              )}
              {m.fuente === "ia" && (
                <p className="text-[9px] mt-1.5 opacity-60 font-semibold uppercase tracking-wider">✨ Generado con IA</p>
              )}
            </div>
          </div>
        ))}
        {cargando && (
          <div className="flex justify-start">
            <div className={`rounded-2xl px-3.5 py-2.5 text-sm border ${tema.burbuja} animate-pulse`}>
              {avatarEmoji} {nombre} está pensando...
            </div>
          </div>
        )}
      </div>

      {accionesRapidas && accionesRapidas.length > 0 && (
        <div className="px-3 pt-2 flex flex-wrap gap-1.5">
          {accionesRapidas.map((accion) => (
            <button
              key={accion}
              type="button"
              onClick={() => !cargando && enviar(accion)}
              disabled={cargando}
              className="text-[10px] font-semibold bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-full px-2.5 py-1 transition-all disabled:opacity-50"
            >
              {accion}
            </button>
          ))}
        </div>
      )}

      <div className="p-3 border-t border-slate-100/70 flex gap-2">
        <div className="focus-glow flex-1 rounded-xl border border-slate-200 transition-all duration-200">
          <input
            type="text"
            value={pregunta}
            onChange={(e) => setPregunta(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !cargando) enviar(); }}
            placeholder={placeholder}
            disabled={cargando}
            className="w-full bg-transparent rounded-xl px-3 py-2 text-sm focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => enviar()}
          disabled={cargando}
          className={`${tema.boton} text-white rounded-xl px-4 py-2 text-sm font-bold transition-all disabled:opacity-50`}
        >
          ➤
        </button>
      </div>
    </section>
  );
}
