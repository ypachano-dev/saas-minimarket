import json
import urllib.request
from typing import Optional
from app.core.config import settings

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"


def tiene_agente_ia() -> bool:
    return bool(settings.ANTHROPIC_API_KEY.strip())


def consultar_agente(
    system_prompt: str,
    contexto: dict,
    pregunta_usuario: Optional[str] = None,
    max_tokens: int = 1024,
    model: Optional[str] = None,
    temperature: Optional[float] = None,
) -> dict:
    """Llama a la IA de Anthropic con el contexto de datos reales del negocio.

    Si no hay ANTHROPIC_API_KEY configurada, o la llamada falla por cualquier motivo
    (sin red, key inválida, rate limit), devuelve fuente != "ia" para que el endpoint
    que invoca esta función use su propio resumen basado en reglas como respaldo --
    el mismo patrón defensivo de la integración de Google Maps: nunca romper la UI
    ni dejar al usuario sin respuesta por falta de una key externa.
    """
    if not tiene_agente_ia():
        return {"respuesta": None, "fuente": "sin_configurar"}

    mensaje_usuario = (pregunta_usuario or "").strip() or "Genera tu análisis y recomendaciones a partir del contexto de datos."

    body = {
        "model": model or settings.ANTHROPIC_MODEL,
        "max_tokens": max_tokens,
        "system": system_prompt,
        "messages": [
            {
                "role": "user",
                "content": (
                    f"Contexto de datos reales del negocio (JSON):\n{json.dumps(contexto, ensure_ascii=False, default=str)}\n\n"
                    f"Instrucción del usuario: {mensaje_usuario}"
                ),
            }
        ],
    }
    if temperature is not None:
        body["temperature"] = temperature

    req = urllib.request.Request(
        ANTHROPIC_API_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-api-key": settings.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=25) as res:
            data = json.loads(res.read().decode("utf-8"))
        texto = "".join(
            bloque.get("text", "") for bloque in data.get("content", []) if bloque.get("type") == "text"
        ).strip()
        if not texto:
            return {"respuesta": None, "fuente": "error"}
        return {"respuesta": texto, "fuente": "ia"}
    except Exception:
        return {"respuesta": None, "fuente": "error"}
