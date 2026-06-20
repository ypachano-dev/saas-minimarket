import { useLoadScript } from "@react-google-maps/api";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

// Librerías necesarias: "places" para el autocompletado de direcciones del formulario de delivery.
const LIBRARIES: ("places")[] = ["places"];

// Mientras no haya una API Key configurada en frontend/.env, ningún componente debe intentar
// cargar el script de Google ni renderizar un <GoogleMap>: usan en su lugar el modo de respaldo
// (mapa simulado, distancia por aproximación) sin que la app se rompa.
export const TIENE_GOOGLE_MAPS_KEY = Boolean(GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY.trim().length > 0);

export function useGoogleMaps() {
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY ?? "",
    libraries: LIBRARIES,
    // Evita que el hook intente cargar el script si no hay key: useLoadScript siempre se llama
    // (las reglas de hooks lo exigen), pero con preventGoogleFontsLoading no hacemos red de más.
    preventGoogleFontsLoading: true,
  });

  return {
    isLoaded: TIENE_GOOGLE_MAPS_KEY && isLoaded,
    loadError,
  };
}
