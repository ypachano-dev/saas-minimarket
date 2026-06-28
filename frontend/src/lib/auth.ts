// Lectura de claims del JWT guardado en localStorage (sub=usuario_id, eid, rol, email, nombre).
// Mismo patrón que getRolFromToken() en App.tsx, reutilizable donde se necesite
// también el email (ej. Caja, para la reautenticación de apertura de turno).
export interface TokenClaims {
  usuario_id: number | null;
  rol: string | null;
  email: string | null;
  nombre: string | null;
}

export function leerClaimsToken(): TokenClaims {
  const token = localStorage.getItem("access_token");
  if (!token) return { usuario_id: null, rol: null, email: null, nombre: null };
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return {
      usuario_id: payload.sub ? Number(payload.sub) : null,
      rol: payload.rol ?? null,
      email: payload.email ?? null,
      nombre: payload.nombre ?? null,
    };
  } catch {
    return { usuario_id: null, rol: null, email: null, nombre: null };
  }
}
