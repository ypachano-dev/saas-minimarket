import { useState, useEffect, useCallback } from "react";
import apiClient from "../api/client";

export interface ItemSincronizacion {
  id_local: string;
  entidad: "ticket" | "cliente" | "visita";
  datos_json: string;
}

export interface SincronizacionResultado {
  id_local: string;
  sincronizado: boolean;
  id_remoto?: number;
  error?: string;
}

const STORAGE_KEY = "offline_sync_queue";

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [queue, setQueue] = useState<ItemSincronizacion[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Cargar cola inicial desde localStorage
  useEffect(() => {
    const savedQueue = localStorage.getItem(STORAGE_KEY);
    if (savedQueue) {
      try {
        setQueue(JSON.parse(savedQueue));
      } catch (e) {
        console.error("Error al cargar la cola de sincronización desde localStorage:", e);
      }
    }
  }, []);

  // Escuchar cambios en la conexión de red
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Guardar una nueva transacción en la cola local
  const guardarTransaccionOffline = useCallback(
    (entidad: "ticket" | "cliente" | "visita", datos: any) => {
      const idLocal = `${entidad}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const nuevoItem: ItemSincronizacion = {
        id_local: idLocal,
        entidad,
        datos_json: JSON.stringify(datos),
      };

      setQueue((prevQueue) => {
        const updated = [...prevQueue, nuevoItem];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });

      console.log(`[OfflineSync] Transacción ${idLocal} registrada offline.`);
      return idLocal;
    },
    []
  );

  // Ejecutar el envío de la cola al backend
  const sincronizarCola = useCallback(async () => {
    if (isSyncing || queue.length === 0 || !navigator.onLine) return;

    setIsSyncing(true);
    console.log(`[OfflineSync] Iniciando sincronización de ${queue.length} elementos...`);

    try {
      const response = await apiClient.post("/api/v1/sincronizar", { items: queue });
      const resultados: SincronizacionResultado[] = response.data.resultados;

      // Filtrar de la cola los elementos que fueron sincronizados exitosamente
      setQueue((prevQueue) => {
        const remaining = prevQueue.filter((item) => {
          const res = resultados.find((r) => r.id_local === item.id_local);
          // Si no se encuentra el resultado o falló la sincronización, lo mantenemos en la cola
          return !res || !res.sincronizado;
        });

        localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
        return remaining;
      });

      console.log("[OfflineSync] Lote de sincronización procesado.");
    } catch (error) {
      console.error("[OfflineSync] Error al sincronizar con el backend:", error);
    } finally {
      setIsSyncing(false);
    }
  }, [queue, isSyncing]);

  // Sincronizar automáticamente al recuperar la conexión a internet
  useEffect(() => {
    if (isOnline && queue.length > 0) {
      sincronizarCola();
    }
  }, [isOnline, queue.length, sincronizarCola]);

  return {
    isOnline,
    queueLength: queue.length,
    isSyncing,
    guardarTransaccionOffline,
    sincronizarCola,
  };
}
