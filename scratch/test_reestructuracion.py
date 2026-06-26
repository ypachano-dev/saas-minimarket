# -*- coding: utf-8 -*-
"""Smoke tests de la reestructuración: segregación de guías IA, arquitectura
multi-negocio, branding por inquilino y CORS. Falla (exit 1) si algo no
responde como se espera."""
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import requests

BASE_URL = "http://localhost:8000"
FALLOS = []


def check(nombre, condicion):
    estado = "OK" if condicion else "FALLO"
    print(f"  [{estado}] {nombre}")
    if not condicion:
        FALLOS.append(nombre)


def login(email, password):
    r = requests.post(f"{BASE_URL}/api/v1/auth/login", json={"email": email, "password": password})
    r.raise_for_status()
    return r.json()["access_token"]


def registrar_tenant_minimarket():
    """Crea un inquilino MiniMarket fresco vía el endpoint de registro (sin depender
    de credenciales preexistentes), ejercitando el Enum estricto TipoNegocio."""
    sufijo = random.randint(10000, 99999)
    payload = {
        "nombre_empresa": f"Test Minimarket {sufijo}",
        "rif_or_cedula": f"J-{sufijo}001-0",
        "tipo_negocio": "minimarket",
        "nombre_admin": "Admin Test",
        "username_admin": f"admintest{sufijo}",
        "email_admin": f"admintest{sufijo}@minimarket.com",
        "password_admin": "Demo1234",
    }
    r = requests.post(f"{BASE_URL}/api/v1/auth/registrar-saas", json=payload)
    r.raise_for_status()
    return login(payload["email_admin"], payload["password_admin"])


def main():
    print("== 1. Autenticación ==")
    token_minimarket = registrar_tenant_minimarket()
    token_agro = login("admin_agro@agro.com", "Demo1234")
    check("Registro + login minimarket devuelve token", bool(token_minimarket))
    check("Login agroferretería devuelve token", bool(token_agro))

    h_mini = {"Authorization": f"Bearer {token_minimarket}"}
    h_agro = {"Authorization": f"Bearer {token_agro}"}

    print("\n== 2. CORS (preflight desde localhost:5173) ==")
    r = requests.options(
        f"{BASE_URL}/api/v1/empresa/mi-config",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"},
    )
    check("OPTIONS preflight responde 200/204", r.status_code in (200, 204))
    check("Access-Control-Allow-Origin presente", "access-control-allow-origin" in {k.lower() for k in r.headers})

    print("\n== 3. Arquitectura multi-negocio dinámica (/api/v1/empresa/mi-config) ==")
    r1 = requests.get(f"{BASE_URL}/api/v1/empresa/mi-config", headers=h_mini)
    check("mi-config (minimarket) -> 200", r1.status_code == 200)
    cfg_mini = r1.json()
    check("tipo_negocio es 'minimarket'", cfg_mini.get("tipo_negocio") == "minimarket")
    check("nomenclatura.inventario = 'Productos'", cfg_mini.get("nomenclatura", {}).get("inventario") == "Productos")
    check("nombre_corto presente", bool(cfg_mini.get("nombre_corto")))

    r2 = requests.get(f"{BASE_URL}/api/v1/empresa/mi-config", headers=h_agro)
    check("mi-config (agro) -> 200", r2.status_code == 200)
    cfg_agro = r2.json()
    check("tipo_negocio normalizado a 'ferreagropecuaria'", cfg_agro.get("tipo_negocio") == "ferreagropecuaria")
    check("nomenclatura.inventario = 'Insumos y Ferretería'", cfg_agro.get("nomenclatura", {}).get("inventario") == "Insumos y Ferretería")
    check("nomenclatura.suite = 'Agroferretería Suite'", cfg_agro.get("nomenclatura", {}).get("suite") == "Agroferretería Suite")

    print("\n== 4. Segregación individual de guías IA (VALE / YHORGE / ALO) ==")
    r = requests.post(f"{BASE_URL}/api/v1/agentes/vale", headers=h_mini, json={"pregunta": "test"})
    check("VALE responde 200 (módulo 'estadisticas' habilitado en minimarket)", r.status_code == 200)
    body = r.json()
    check("Respuesta de VALE tiene forma {agente, respuesta, fuente}", {"agente", "respuesta", "fuente"} <= set(body))

    r = requests.post(f"{BASE_URL}/api/v1/agentes/yhorge", headers=h_mini, json={"pregunta": "test"})
    check("YHORGE responde 200 (módulo 'cuentas' habilitado en minimarket)", r.status_code == 200)

    r = requests.post(f"{BASE_URL}/api/v1/agentes/alo", headers=h_mini, json={"cliente_id": 1, "pregunta": "test"})
    check("ALO responde 200 o 404 (cliente puede no existir, pero el módulo 'crm' está autorizado)", r.status_code in (200, 404))

    print("\n== 5. Tipos estrictos: valor inválido de tipo_negocio cae a MINIMARKET sin romper ==")
    from app.core.negocio_config import normalizar_tipo_negocio, TipoNegocio
    check("Valor heredado 'agroferreteria' normaliza a FERREAGROPECUARIA", normalizar_tipo_negocio("agroferreteria") == TipoNegocio.FERREAGROPECUARIA)
    check("Valor basura cae a MINIMARKET sin excepción", normalizar_tipo_negocio("valor_invalido_xyz") == TipoNegocio.MINIMARKET)
    check("None cae a MINIMARKET sin excepción", normalizar_tipo_negocio(None) == TipoNegocio.MINIMARKET)

    print("\n" + "=" * 60)
    if FALLOS:
        print(f"RESULTADO: {len(FALLOS)} fallo(s) -> {FALLOS}")
        sys.exit(1)
    print("RESULTADO: TODAS LAS PRUEBAS PASARON (200 OK / comportamiento esperado)")


if __name__ == "__main__":
    main()
