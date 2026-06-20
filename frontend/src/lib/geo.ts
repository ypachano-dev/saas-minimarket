export interface LatLng {
  lat: number;
  lng: number;
}

// Centro por defecto del mapa: Barinas, Venezuela (sede principal del minimarket demo)
export const CENTRO_POR_DEFECTO: LatLng = { lat: 8.6226, lng: -70.2075 };

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

// ---- Aproximación usada como respaldo cuando no hay API Key o la Routes API falla ----
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function calcularEtaMinAproximado(distanciaKm: number): number {
  const VELOCIDAD_PROMEDIO_KMH = 28;
  const TIEMPO_PREPARACION_MIN = 5;
  return Math.round((distanciaKm / VELOCIDAD_PROMEDIO_KMH) * 60) + TIEMPO_PREPARACION_MIN;
}

export interface RutaCalculada {
  distanciaKm: number;
  etaMin: number;
  esReal: boolean; // true si vino de la Routes API; false si es la aproximación haversine
  path?: LatLng[]; // trazo real decodificado, para dibujar con <Polyline>
}

// Decodifica un polyline codificado (algoritmo estándar de Google) en una lista de puntos lat/lng
function decodificarPolyline(encoded: string): LatLng[] {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const path: LatLng[] = [];

  while (index < encoded.length) {
    let resultado = 0;
    let shift = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(index++) - 63;
      resultado |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += resultado & 1 ? ~(resultado >> 1) : resultado >> 1;

    resultado = 0;
    shift = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      resultado |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += resultado & 1 ? ~(resultado >> 1) : resultado >> 1;

    path.push({ lat: lat * 1e-5, lng: lng * 1e-5 });
  }
  return path;
}

// Calcula distancia + ETA + trazo real con la Routes API (REST) de Google -- el reemplazo
// vigente de la antigua Directions API, que Google bloquea para proyectos nuevos de Cloud
// ("legacy API not enabled for your project"). Si falla (sin red, sin ruta vial, key inválida,
// API no habilitada) cae de inmediato a la aproximación por línea recta para no romper el flujo.
export async function calcularRutaReal(origen: LatLng, destino: LatLng): Promise<RutaCalculada> {
  const distanciaAprox = haversineKm(origen.lat, origen.lng, destino.lat, destino.lng);
  const fallback: RutaCalculada = {
    distanciaKm: Math.round(distanciaAprox * 100) / 100,
    etaMin: calcularEtaMinAproximado(distanciaAprox),
    esReal: false,
  };

  if (!GOOGLE_MAPS_API_KEY) {
    return fallback;
  }

  try {
    const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: origen.lat, longitude: origen.lng } } },
        destination: { location: { latLng: { latitude: destino.lat, longitude: destino.lng } } },
        travelMode: "DRIVE",
      }),
    });

    if (!res.ok) {
      return fallback;
    }

    const data = await res.json();
    const ruta = data.routes?.[0];
    if (!ruta?.distanceMeters || !ruta?.duration) {
      return fallback;
    }

    const segundos = parseInt(String(ruta.duration).replace("s", ""), 10);
    return {
      distanciaKm: Math.round((ruta.distanceMeters / 1000) * 100) / 100,
      etaMin: Math.round(segundos / 60),
      esReal: true,
      path: ruta.polyline?.encodedPolyline ? decodificarPolyline(ruta.polyline.encodedPolyline) : undefined,
    };
  } catch {
    return fallback;
  }
}
