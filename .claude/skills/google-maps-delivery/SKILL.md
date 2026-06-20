---
name: google-maps-delivery
description: Use when working on the Delivery module of this MiniMarket SaaS (route map, ETA, live GPS tracking, the repartidor's view, or the "Enviar por Delivery" flow in Caja). Covers how Google Maps is wired in with a graceful no-API-key fallback.
---

# Delivery Module: Google Maps Integration

This project's Delivery module (`MapaDelivery.tsx`, `DeliveryOrderForm.tsx`, `ModuloRepartidor.tsx`) integrates Google Maps for real routes, ETA, address autocomplete, and live GPS tracking of repartidores. The key design constraint: **everything must keep working even when `VITE_GOOGLE_MAPS_API_KEY` is empty** (no Google Cloud billing account configured yet). Always preserve the fallback path when touching this code.

## Architecture

- **`frontend/src/hooks/useGoogleMaps.ts`** — wraps `useLoadScript` from `@react-google-maps/api`. Exports `TIENE_GOOGLE_MAPS_KEY` (boolean, read from `import.meta.env.VITE_GOOGLE_MAPS_API_KEY`) and `useGoogleMaps()` returning `{ isLoaded }`. `isLoaded` is always `false` when no key is set, so components never try to render a real `<GoogleMap>` without one.
- **`frontend/src/lib/geo.ts`** — `calcularRutaReal(origen, destino)` tries Google's `DirectionsService` (driving mode) and falls back to a haversine-based straight-line estimate (`esReal: false` in the result) if `google.maps` isn't loaded or the request fails. Always use this helper instead of calling `DirectionsService` directly, and always branch UI on `esReal` to label estimates as "(aprox.)" vs "(real)".
- **Pattern for every map-touching component**: `if (isLoaded) { <GoogleMap>... } else { <svg>...simulated map...</svg> or a text placeholder }`. Never let the no-key path throw or render blank.

## Backend pieces

- `Vehiculo` model (`app/models/vehiculo.py`) has `lat`, `lng`, `ubicacion_actualizada_en` — this is where a repartidor's live GPS position is stored, scoped to whichever vehicle they picked when they opened their app (see `ModuloRepartidor.tsx`, persisted in `localStorage["repartidor_vehiculo_id"]`). There's no separate per-user position table; one vehicle = one tracked position.
- `PUT /api/v1/vehiculos/{id}/ubicacion` — repartidor's phone calls this every ~15s via `navigator.geolocation.watchPosition`.
- `PUT /api/v1/pedidos/{id}/estado` — advances the `PedidoDelivery.estado` workflow (`CREADO → ARMADO → FACTURADO → EN_VIA → DESPACHADO → PAGADO`, with `CREDITO` as a side branch). Both the dispatcher (Caja/`DeliveryOrderForm`) and the repartidor (`ModuloRepartidor`) can call it.
- `GET /api/v1/pedidos?chofer_cedula=...` — filters orders assigned to a specific repartidor. `chofer_cedula` is actually the user's **email** (see `DeliveryOrderForm`'s chofer dropdown, which sources from `/api/v1/usuarios` and uses `email` as the value) — this is legacy naming, not a real cédula.
- JWT now includes an `email` claim (added in `security.py`/`main.py` login) specifically so the frontend can decode `getTokenClaims().email` and self-filter "my assigned orders" in `ModuloRepartidor`.
- Role `"repartidor"` was added to `ROLES_OPERACION` in `main.py` so delivery staff can hit `/pedidos` and `/vehiculos` endpoints. `Usuario.rol` is a free-text string column — no enum/migration needed to introduce new roles, just add the string to the right `ROLES_*` group and gate frontend views off `rol` from the decoded JWT.

## Role-based routing

`App.tsx` renders `ModuloRepartidor` instead of `MapaDelivery` for the `"delivery"` sidebar entry when `rol === "repartidor"`. `Sidebar.tsx` also hides every other module for that role — repartidores only see "Delivery Exprés". When adding new delivery-adjacent features, decide explicitly whether they belong to the dispatcher view (`MapaDelivery`/`DeliveryOrderForm`, used by cajero/admin/propietario) or the field view (`ModuloRepartidor`, mobile-first, GPS-driven).

## Gotchas

- `tsconfig.app.json` restricts global `types` to `["vite/client", "google.maps"]` (it doesn't auto-include all `@types/*` packages). If `google.maps` types stop resolving after a dependency bump, check this array first.
- Places Autocomplete is restricted to `componentRestrictions: { country: "ve" }` (Venezuela) — adjust if the business expands.
- `DeliveryOrderForm` accepts an `initialData?: Partial<PedidoForm>` prop for prefilling from other flows (used by `ModuloCaja`'s "🚚 Enviar por Delivery" button after a sale completes). Reuse this prop instead of duplicating the form.
- The `.env` key is gitignored (`frontend/.gitignore`); `.env.example` documents the variable name without a real value. Never commit a real key.

### Legacy API trap (verified, do not regress)

**Never use `google.maps.places.Autocomplete` or `google.maps.DirectionsService`.** As of March 2025, Google blocks both legacy widgets/services for *new* Google Cloud projects with a hard `REQUEST_DENIED` / "legacy API not enabled for your project" error — confirmed in this project by actually running it against a freshly-created project's key. Enabling more legacy APIs in Cloud Console does **not** fix it; the project's creation date gates access, not its API list.

Current, working replacements (already implemented — keep using these):
- **Address autocomplete**: `google.maps.places.PlaceAutocompleteElement`, wrapped in `frontend/src/components/PlaceAutocompleteInput.tsx`. It's a custom element (shadow DOM, own `gmp-select` event), not a React-controlled input — that's why it's a thin imperative wrapper instead of a `@react-google-maps/api` component. Requires the **"Places API (New)"** product enabled in Cloud Console (not the old "Places API").
- **Routes/ETA**: REST call to `https://routes.googleapis.com/directions/v2:computeRoutes` (see `calcularRutaReal` in `frontend/src/lib/geo.ts`), called directly via `fetch` with the API key in the `X-Goog-Api-Key` header — not through any `google.maps.*` JS class. Returns an encoded polyline, decoded locally (`decodificarPolyline`) into a `LatLng[]` and drawn with `<Polyline>` (not `<DirectionsRenderer>`, which expects the legacy `DirectionsResult` shape). Requires the **"Routes API"** product enabled in Cloud Console.
- Both `MapaDelivery.tsx` and `ModuloRepartidor.tsx` render routes via `<Polyline path={...}>` for this reason — don't reintroduce `<DirectionsRenderer>`.
- `DeliveryOrderForm` detects `PlaceAutocompleteElement` availability at runtime (`tienePlaceAutocomplete`) and falls back to the simulated address dropdown (`UBICACIONES_CONOCIDAS`) if it's missing — this is what keeps the form usable even before "Places API (New)" is enabled, instead of showing Google's broken-widget overlay to the user.
