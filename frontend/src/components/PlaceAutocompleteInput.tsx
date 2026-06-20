import { useEffect, useRef } from "react";

interface LugarSeleccionado {
  direccion: string;
  lat: number;
  lng: number;
}

interface PlaceAutocompleteInputProps {
  className?: string;
  placeholder?: string;
  countryRestriction?: string;
  onPlaceSelected: (lugar: LugarSeleccionado) => void;
}

// Envuelve el elemento web `google.maps.places.PlaceAutocompleteElement` (Places API New).
// Reemplaza al widget legado `google.maps.places.Autocomplete`, que Google bloquea para
// proyectos nuevos de Google Cloud desde marzo de 2025 ("not available to new customers").
// Si la clase no existe todavía (script no cargado / proyecto sin "Places API (New)"
// habilitada), este componente no renderiza nada y el padre debe usar su propio respaldo.
export default function PlaceAutocompleteInput({
  className,
  placeholder,
  countryRestriction = "ve",
  onPlaceSelected,
}: PlaceAutocompleteInputProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const PlaceAutocompleteElementClass = (window as any).google?.maps?.places?.PlaceAutocompleteElement;
    if (!containerRef.current || !PlaceAutocompleteElementClass) return;

    const elemento = new PlaceAutocompleteElementClass({
      componentRestrictions: { country: countryRestriction },
    });
    if (placeholder) elemento.placeholder = placeholder;
    elemento.classList.add("w-full");

    const onSelect = async (event: any) => {
      try {
        const place = event.placePrediction.toPlace();
        await place.fetchFields({ fields: ["formattedAddress", "location"] });
        const loc = place.location;
        if (!loc) return;
        onPlaceSelected({
          direccion: place.formattedAddress ?? "",
          lat: typeof loc.lat === "function" ? loc.lat() : loc.lat,
          lng: typeof loc.lng === "function" ? loc.lng() : loc.lng,
        });
      } catch {
        // Si Google no puede resolver el lugar elegido, el usuario simplemente reintenta
      }
    };
    elemento.addEventListener("gmp-select", onSelect);
    containerRef.current.appendChild(elemento);

    return () => {
      elemento.removeEventListener("gmp-select", onSelect);
      containerRef.current?.removeChild(elemento);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className={className} />;
}
