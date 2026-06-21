// Departamentos de pesaje (Balanza Digital) y su normalizacion compartida.
// Centralizado aqui porque antes existian dos copias divergentes de normalizeDept
// (ModuloBalanza.tsx y ModuloCaja.tsx) que podian desincronizarse silenciosamente.

export interface DepartamentoPesaje {
  key: string; // valor canonico exacto a guardar en Producto.linea
  emoji: string;
  label: string;
}

export const DEPARTAMENTOS_PESAJE: DepartamentoPesaje[] = [
  { key: "Carnicería", emoji: "🥩", label: "🥩 Carnicería" },
  { key: "Verdulería y Frutas", emoji: "🍅", label: "🍅 Verdulería y Frutas" },
  { key: "Charcutería", emoji: "🧀", label: "🧀 Charcutería" },
];

export function normalizeDept(linea: string | null | undefined): string {
  if (!linea) return "";
  const norm = linea.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (
    norm.includes("verduleria") ||
    norm.includes("verdura") ||
    norm.includes("fruta") ||
    norm.includes("fruver")
  ) {
    return "verduleria";
  }
  if (
    norm.includes("carniceria") ||
    norm.includes("carne")
  ) {
    return "carniceria";
  }
  if (
    norm.includes("charcuteria") ||
    norm.includes("lacteo") ||
    norm.includes("embutido") ||
    norm.includes("queso") ||
    norm.includes("jamon")
  ) {
    return "charcuteria";
  }
  return norm;
}
