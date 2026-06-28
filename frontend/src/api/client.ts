import axios from "axios";

// Si VITE_API_URL no está fijado: en el servidor de desarrollo de Vite (puerto 5173/5174)
// el backend vive en el mismo host pero puerto 8000 — así abrir http://192.168.x.x:5173
// desde otro dispositivo en la misma red (ej. una tablet) apunta solo el backend correcto,
// sin tener que hardcodear la IP del equipo que corre los servidores. Pero en producción
// (Render, Docker) FastAPI sirve el frontend ya compilado y la API desde el mismo proceso
// y el mismo origen (sin puerto separado), así que ahí debe usarse una baseURL relativa.
const esServidorDevVite = window.location.port === "5173" || window.location.port === "5174";
const apiBaseUrl = import.meta.env.VITE_API_URL
  || (esServidorDevVite ? `${window.location.protocol}//${window.location.hostname}:8000` : "");

const apiClient = axios.create({
  baseURL: apiBaseUrl,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default apiClient;
