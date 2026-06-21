// Helpers de fecha en formato "YYYY-MM-DD" (el que esperan los query params del backend
// y los <input type="date"> nativos), sin librerías de terceros.

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function hoyISO(): string {
  return toISO(new Date());
}

export function primerDiaMesActual(): string {
  const d = new Date();
  return toISO(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function primerDiaMesAnterior(): string {
  const d = new Date();
  return toISO(new Date(d.getFullYear(), d.getMonth() - 1, 1));
}

export function ultimoDiaMesAnterior(): string {
  const d = new Date();
  return toISO(new Date(d.getFullYear(), d.getMonth(), 0));
}

export function haceNDias(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toISO(d);
}
