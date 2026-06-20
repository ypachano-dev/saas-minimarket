---
name: agentes-vale-yhorge-alo
description: Use when working on the AI agents (VALE, YHORGE, ALO), the Estadísticas Avanzadas, Cartera y Créditos, or Bancos y Tesorería modules of this MiniMarket SaaS. Covers the shared agent core, the rule-based fallback pattern, and how each module is grounded in real data.
---

# Agentes de IA: VALE, YHORGE, ALO

Este SaaS responde a la competencia **arizon.ai** (que ofrece tres agentes: Ari = ventas, Maru = cobranza, Ori = analítica) con su propia tríada, pero con una diferencia de fondo: **cada agente recibe datos reales y estructurados del negocio como contexto antes de responder**, en vez de ser un chatbot genérico. Si no hay `ANTHROPIC_API_KEY` configurada, cada agente cae a un resumen basado en reglas sobre esos mismos datos — nunca un stub vacío, nunca un error visible. Mismo patrón defensivo que la integración de Google Maps (ver `[[google-maps-delivery]]`).

## Los tres agentes

| Agente | Rol | Equivalente en arizon.ai | Vive en |
|---|---|---|---|
| **VALE** | Analítica y decisiones | Ori | Módulo "Estadísticas Avanzadas" (`ModuloEstadisticas.tsx`) |
| **YHORGE** | Cobranza y tesorería | Maru | Módulos "Cartera y Créditos" y "Bancos y Tesorería" (`ModuloCartera.tsx`, `ModuloTesoreria.tsx`) |
| **ALO** | Ventas y CRM | Ari | Integrado dentro de `ModuloCRM.tsx` (botón "✨ ALO" por cada fila del Libro de Faltantes) |

## Arquitectura

- **`app/core/ai_agent.py`** — `consultar_agente(system_prompt, contexto, pregunta_usuario)` llama a la API de Anthropic (`https://api.anthropic.com/v1/messages`) vía `urllib.request` (sin SDK adicional, mismo estilo que el fetch de tasa BCV en `main.py`). Devuelve `{"fuente": "ia"}` si responde bien, o `{"fuente": "sin_configurar" | "error"}` si no hay key o falla — en ambos casos el endpoint que llama debe tener su propio fallback basado en reglas.
- **`ANTHROPIC_API_KEY`** y **`ANTHROPIC_MODEL`** en `app/core/config.py` — vacía por defecto. Configúrala en variables de entorno o `.env` del backend (no del frontend; esta llamada es server-side).
- Cada endpoint de agente en `main.py` (`/api/v1/agentes/vale`, `/yhorge`, `/alo`) sigue el mismo patrón:
  1. Reúne contexto real con un helper reutilizable (`_calcular_estadisticas`, `_calcular_resumen_cartera`, `_calcular_resumen_tesoreria` — todos extraídos como funciones planas, no solo endpoints, precisamente para que los agentes puedan reusarlos sin duplicar queries).
  2. Llama a `consultar_agente(SYSTEM_PROMPT, contexto, pregunta)`.
  3. Si `fuente == "ia"`, devuelve la respuesta de la IA. Si no, devuelve `_fallback_vale/_yhorge/_alo(contexto)` — funciones Python que generan un resumen en español a partir del mismo dict de contexto.
- **Frontend**: `AgentPanel.tsx` es el componente de chat reutilizable (usado por VALE y YHORGE). Props clave: `apiPath` (endpoint), `autoIniciar` (dispara un análisis automático al montar, llamando con `pregunta` vacía), `colorTema`. **ALO no usa `AgentPanel`** porque su schema (`AloConsulta`) requiere `cliente_id`, no `pregunta` — su integración es el botón puntual en `ModuloCRM.tsx` que abre un modal con el mensaje generado, botón de copiar y enlace `wa.me` directo (usa `Cliente.telefono`).

## Gotchas

- Los campos `Decimal` de Pydantic se serializan como **strings** en el JSON (ej. `"saldo_actual": "50000.00"`), no como números — patrón ya existente en `ModuloCaja.tsx`/`ModuloBalanza.tsx`. Todo helper `fmt()` nuevo debe aceptar `number | string` y hacer `Number(n)` antes de formatear, o vas a renderizar el string crudo sin separadores de miles.
- `ROLES_GESTION` (admin/propietario) protege Tesorería, Cartera y Estadísticas — son módulos financieros, no deben ser accesibles para cajero/repartidor.
- `chofer_cedula` en `PedidoDelivery` y el dropdown de chofer en `DeliveryOrderForm` en realidad almacenan el **email** del usuario, no una cédula real (deuda técnica heredada, no introducida por los agentes).
- Si agregas un cuarto agente o cambias el modelo de IA, recuerda que `ANTHROPIC_MODEL` es configurable — no hardcodees el nombre del modelo en los endpoints.
- Los bancos válidos (`BANCOS_VALIDOS` en `app/models/tesoreria.py`) deben mantenerse sincronizados entre el backend (validación) y el array `BANCOS` en `ModuloTesoreria.tsx` (UI) si se agregan o quitan opciones.
