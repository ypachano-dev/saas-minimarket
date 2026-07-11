/**
 * useAuthorization — Hook de Autorización Centralizado
 * 
 * Centraliza toda la lógica de gating de módulos e IAs del frontend.
 * Consulta /api/v1/empresa/mi-config y expone helpers tipados para
 * que cualquier componente pueda preguntar de forma simple:
 *   - hasModule('crm')        → ¿Tiene el módulo CRM habilitado?
 *   - hasAgent('alo')         → ¿Su plan incluye el agente ALO?
 *   - hasRole('admin')        → ¿El usuario tiene ese rol?
 *   - tipoNegocio             → Sector del inquilino (minimarket, carniceria…)
 *   - branding                → Colores, nombre, logo del inquilino
 */
import { useState, useEffect, useCallback } from "react";
import apiClient from "../api/client";

// ─────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────
export type AgentKey = "vale" | "yhorge" | "alo";

export type TipoNegocio =
  | "minimarket"
  | "carniceria"
  | "ferreteria"
  | "agroferreteria"
  | "agropecuaria";

export interface NomenclaturaNegocio {
  suite: string;
  inventario: string;
  item_inventario: string;
  venta: string;
}

export interface EmpresaConfig {
  id: number;
  rif: string;
  nombre_comercial: string;
  nombre_corto: string | null;
  tipo_negocio: TipoNegocio;
  color_primario: string;
  color_secundario: string;
  logo_url: string | null;
  modulos_habilitados: string[];
  nomenclatura: NomenclaturaNegocio;
  agente_vale_activo: boolean;
  agente_yhorge_activo: boolean;
  agente_alo_activo: boolean;
  agente_vale_incluido: boolean;
  agente_yhorge_incluido: boolean;
  agente_alo_incluido: boolean;
}

export interface AuthorizationState {
  /** Configuración completa del inquilino (null mientras carga) */
  empresaConfig: EmpresaConfig | null;
  /** Rol del usuario autenticado */
  rol: string | null;
  /** true durante la carga inicial */
  cargando: boolean;
  /** ¿El módulo está habilitado para este inquilino y plan? */
  hasModule: (key: string) => boolean;
  /** ¿El plan del inquilino incluye este agente de IA? */
  hasAgent: (agent: AgentKey) => boolean;
  /** ¿El agente de IA está activo (habilitado por el admin del inquilino)? */
  isAgentActive: (agent: AgentKey) => boolean;
  /** ¿El usuario tiene uno de los roles indicados? */
  hasRole: (...roles: string[]) => boolean;
  /** Refresca la configuración desde el servidor */
  recargar: () => void;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function getRolFromToken(): string | null {
  const token = localStorage.getItem("access_token");
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.rol ?? null;
  } catch {
    return null;
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const fullHex = hex.replace(
    /^#?([a-f\d])([a-f\d])([a-f\d])$/i,
    (_, r, g, b) => r + r + g + g + b + b
  );
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : null;
}

function aplicarColoresBranding(config: EmpresaConfig): void {
  const primary = config.color_primario || "#8b5cf6";
  const secondary = config.color_secundario || "#6366f1";
  document.documentElement.style.setProperty("--color-primary", primary);
  document.documentElement.style.setProperty("--color-secondary", secondary);
  const primaryRgb = hexToRgb(primary);
  const secondaryRgb = hexToRgb(secondary);
  if (primaryRgb)
    document.documentElement.style.setProperty(
      "--color-primary-rgb",
      `${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}`
    );
  if (secondaryRgb)
    document.documentElement.style.setProperty(
      "--color-secondary-rgb",
      `${secondaryRgb.r}, ${secondaryRgb.g}, ${secondaryRgb.b}`
    );
}

// ─────────────────────────────────────────────────────────────
// Hook Principal
// ─────────────────────────────────────────────────────────────
export function useAuthorization(autenticado: boolean): AuthorizationState {
  const [empresaConfig, setEmpresaConfig] = useState<EmpresaConfig | null>(null);
  const [cargando, setCargando] = useState(true);
  const [contador, setContador] = useState(0); // dispara recargas

  const rol = getRolFromToken();

  const cargarConfig = useCallback(async () => {
    if (!autenticado) {
      setEmpresaConfig(null);
      setCargando(false);
      return;
    }
    setCargando(true);
    try {
      const { data } = await apiClient.get<EmpresaConfig>("/api/v1/empresa/mi-config");
      setEmpresaConfig(data);
      aplicarColoresBranding(data);
    } catch {
      // Un solo reintento tras 1.5s (ej. restart de dev server)
      setTimeout(async () => {
        try {
          const { data } = await apiClient.get<EmpresaConfig>("/api/v1/empresa/mi-config");
          setEmpresaConfig(data);
          aplicarColoresBranding(data);
        } catch {
          // Silencioso: el sistema seguirá con config nula
        } finally {
          setCargando(false);
        }
      }, 1500);
      return;
    }
    setCargando(false);
  }, [autenticado, contador]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    cargarConfig();
  }, [cargarConfig]);

  // Helpers de autorización
  const hasModule = useCallback(
    (key: string): boolean => {
      if (!empresaConfig) return false;
      return empresaConfig.modulos_habilitados.includes(key);
    },
    [empresaConfig]
  );

  const hasAgent = useCallback(
    (agent: AgentKey): boolean => {
      if (!empresaConfig) return false;
      return empresaConfig[`agente_${agent}_incluido`] === true;
    },
    [empresaConfig]
  );

  const isAgentActive = useCallback(
    (agent: AgentKey): boolean => {
      if (!empresaConfig) return false;
      return (
        empresaConfig[`agente_${agent}_incluido`] === true &&
        empresaConfig[`agente_${agent}_activo`] === true
      );
    },
    [empresaConfig]
  );

  const hasRole = useCallback(
    (...roles: string[]): boolean => {
      if (!rol) return false;
      return roles.includes(rol);
    },
    [rol]
  );

  const recargar = useCallback(() => {
    setContador((c) => c + 1);
  }, []);

  return {
    empresaConfig,
    rol,
    cargando,
    hasModule,
    hasAgent,
    isAgentActive,
    hasRole,
    recargar,
  };
}
