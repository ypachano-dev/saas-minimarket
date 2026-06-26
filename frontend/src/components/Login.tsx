import { useState, type FormEvent } from "react";
import apiClient from "../api/client";
import { APP_NAME, FIRMA_PROVEEDOR } from "../config/brand";

interface LoginProps {
  onLogin: () => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState("ypachano@gmail.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);

    // --- BYPASS DE SEGURIDAD PARA LA DEMO EN VIVO ---
    // Si eres tú probando localmente, el sistema fabrica el token en caliente con rol de propietario
    if (email.trim() === "ypachano@gmail.com") {
      const header = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"; // Header JWT estándar
      const payloadObj = { rol: "propietario", sub: "ypachano", name: "Yhonder Pachano" };
      const payloadEncoded = btoa(JSON.stringify(payloadObj));
      const mockToken = `${header}.${payloadEncoded}.signature_demo`;

      localStorage.setItem("access_token", mockToken);
      setCargando(false);
      onLogin();
      return;
    }

    try {
      // Intento normal por API para otros usuarios
      const respuesta = await apiClient.post("/api/v1/auth/login", { email, password });
      if (respuesta.data && respuesta.data.access_token) {
        localStorage.setItem("access_token", respuesta.data.access_token);
        onLogin();
      } else {
        setError("Error en la respuesta del servidor de autenticación.");
      }
    } catch (err: any) {
      setError("Credenciales inválidas o servidor backend desconectado.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 border border-slate-100 shadow-xl space-y-6">
        <div className="space-y-1 text-center">
          <p className="text-sm font-black tracking-tight text-brand-primary">{APP_NAME}</p>
          <h2 className="text-2xl font-black tracking-tight text-slate-900">Portal de Acceso Corporativo</h2>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">ERP & CRM MULTI-INQUILINO (SaaS)</p>
        </div>

        {error && (
          <div className="p-3 rounded-xl text-xs font-bold border bg-rose-50 border-rose-100 text-rose-600 animate-pulse text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="flex flex-col">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-slate-50/50 font-medium"
              placeholder="usuario@correo.com"
              required
            />
          </label>

          <label className="flex flex-col">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white font-mono"
              placeholder="••••••••"
              required={email !== "ypachano@gmail.com"}
            />
          </label>

          <button
            type="submit"
            disabled={cargando}
            className="w-full rounded-2xl bg-slate-900 py-3 text-sm font-bold text-white transition-all duration-300 hover:bg-slate-800 shadow-md disabled:bg-slate-300"
          >
            {cargando ? "Autenticando..." : "Ingresar"}
          </button>
        </form>

        <p className="text-center text-[10px] font-medium text-slate-400 tracking-wide">{FIRMA_PROVEEDOR}</p>
      </div>
    </div>
  );
}