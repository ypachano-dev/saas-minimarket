# -*- coding: utf-8 -*-
"""
Simulación de flujo completo de usuario sobre la API real del SaaS MiniMarket:
  1) Login
  2) Registro de 5 clientes
  3) Simulación de 4 compras (tickets/ventas)
  4) 10 consultas lógicas a las guías internas de Ventas (ALO) y Análisis (VALE)

Requiere que el backend esté corriendo en http://localhost:8000
"""
import sys
import time
import random
import requests

BASE_URL = "http://localhost:8000"
EMAIL = "admin_agro@agro.com"
PASSWORD = "Demo1234"

ANCHO = 78


def linea(char="─"):
    print(char * ANCHO)


def titulo(texto, icono="▶"):
    print()
    linea("═")
    print(f" {icono}  {texto}")
    linea("═")


def paso(texto):
    print(f"  · {texto}")


def ok(texto):
    print(f"  ✅ {texto}")


def err(texto):
    print(f"  ❌ {texto}")


def respuesta_agente(agente, pregunta, data):
    fuente = data.get("fuente", "?")
    respuesta = data.get("respuesta", "(sin respuesta)")
    etiqueta_fuente = "🧠 IA" if fuente == "ia" else "📐 Reglas"
    print(f"\n  ┌─ 🤖 {agente}  [{etiqueta_fuente}]")
    print(f"  │  Pregunta : {pregunta}")
    print("  │  Respuesta:")
    for renglon in str(respuesta).strip().splitlines() or ["(vacío)"]:
        print(f"  │    {renglon}")
    print("  └" + "─" * (ANCHO - 2))


def main():
    print("█" * ANCHO)
    print("  SIMULACIÓN END-TO-END · SaaS MiniMarket (AgroFerretería Demo)".center(ANCHO))
    print("█" * ANCHO)

    session = requests.Session()

    # ------------------------------------------------------------------
    # 1) LOGIN
    # ------------------------------------------------------------------
    titulo("PASO 1 · Autenticación", "🔐")
    paso(f"POST {BASE_URL}/api/v1/auth/login  ({EMAIL})")
    resp = session.post(f"{BASE_URL}/api/v1/auth/login", json={"email": EMAIL, "password": PASSWORD})
    if resp.status_code != 200:
        err(f"Login falló ({resp.status_code}): {resp.text}")
        sys.exit(1)
    token = resp.json()["access_token"]
    session.headers.update({"Authorization": f"Bearer {token}"})
    ok("Token JWT obtenido. Sesión autenticada.")

    # ------------------------------------------------------------------
    # 2) REGISTRO DE 5 CLIENTES
    # ------------------------------------------------------------------
    titulo("PASO 2 · Registro de 5 clientes nuevos", "👥")
    sufijo = random.randint(10000, 99999)
    clientes_nuevos = [
        {"cedula": f"V-{sufijo}{i}", "nombre": nombre, "telefono": telefono, "direccion": direccion}
        for i, (nombre, telefono, direccion) in enumerate([
            ("Finca Los Robles", "+58414" + str(1000000 + sufijo), "Carretera Nacional km 12"),
            ("Distribuidora El Sembrador", "+58424" + str(2000000 + sufijo), "Av. Bolívar, Galpón 4"),
            ("Cultivos Hermanos Pérez", "+58412" + str(3000000 + sufijo), "Sector Agrícola Norte"),
            ("Vivero Tierra Fértil", "+58416" + str(4000000 + sufijo), "Calle Las Flores #22"),
            ("Agropecuaria San José", "+58426" + str(5000000 + sufijo), "Vía El Tigre, Local 8"),
        ])
    ]

    clientes_creados = []
    for c in clientes_nuevos:
        paso(f"POST /api/v1/clientes  →  {c['nombre']} (Cédula {c['cedula']})")
        r = session.post(f"{BASE_URL}/api/v1/clientes", json=c)
        if r.status_code in (200, 201):
            data = r.json()
            clientes_creados.append(data)
            ok(f"Cliente registrado con id={data['id']}")
        else:
            err(f"No se pudo crear a {c['nombre']} ({r.status_code}): {r.text}")
        time.sleep(0.05)

    if not clientes_creados:
        err("Ningún cliente se pudo registrar. Abortando simulación.")
        sys.exit(1)

    print()
    print(f"  Resumen: {len(clientes_creados)}/5 clientes registrados exitosamente.")

    # ------------------------------------------------------------------
    # 3) SIMULACIÓN DE 4 COMPRAS
    # ------------------------------------------------------------------
    titulo("PASO 3 · Simulación de 4 compras (ventas/tickets)", "🛒")

    paso("GET /api/v1/productos  (catálogo disponible)")
    rp = session.get(f"{BASE_URL}/api/v1/productos")
    productos = rp.json() if rp.status_code == 200 else []
    productos_con_stock = [p for p in productos if p.get("stock_total", 0) > 0]
    if not productos_con_stock:
        err("No hay productos con stock disponible. Abortando ventas.")
        productos_con_stock = []
    else:
        ok(f"{len(productos_con_stock)} productos con stock disponible.")

    compras_simuladas = []
    for i in range(4):
        cliente = clientes_creados[i % len(clientes_creados)]
        if not productos_con_stock:
            break
        producto = random.choice(productos_con_stock)
        cantidad = round(random.uniform(1, 3), 3)
        payload = {
            "cliente_id": cliente["id"],
            "items": [{"producto_id": producto["id"], "peso": str(cantidad)}],
        }
        paso(f"Compra #{i+1}: {cliente['nombre']}  →  {cantidad} x {producto['nombre']}")
        r = session.post(f"{BASE_URL}/api/v1/tickets", json=payload)
        if r.status_code in (200, 201):
            venta = r.json()
            compras_simuladas.append(venta)
            ok(f"Venta cerrada. Total: ${venta['total_usd']} USD (Bs. {venta['total_ves']})")
        else:
            err(f"Compra #{i+1} falló ({r.status_code}): {r.text}")
        time.sleep(0.05)

    print()
    total_usd_acumulado = sum(float(v["total_usd"]) for v in compras_simuladas)
    print(f"  Resumen: {len(compras_simuladas)}/4 compras simuladas. Total acumulado: ${total_usd_acumulado:.2f} USD")

    # ------------------------------------------------------------------
    # 4) 10 CONSULTAS A LAS GUÍAS INTERNAS (VENTAS = ALO, ANÁLISIS = VALE)
    # ------------------------------------------------------------------
    titulo("PASO 4 · 10 consultas lógicas a las guías internas (Ventas y Análisis)", "📚")

    cliente_ref = clientes_creados[0]

    consultas_ventas = [
        {"cliente_id": cliente_ref["id"], "pregunta": "¿Qué le sugiero ofrecer a este cliente en su próxima compra?"},
        {"cliente_id": cliente_ref["id"], "pregunta": "¿Cuál es el historial de compras de este cliente?"},
        {"cliente_id": cliente_ref["id"], "contexto": "Bomba de Riego Gasolina 2 HP", "pregunta": "El producto que pidió no está disponible, ¿qué le ofrezco?"},
        {"cliente_id": cliente_ref["id"], "pregunta": "Redacta un mensaje de WhatsApp para fidelizar a este cliente."},
        {"cliente_id": cliente_ref["id"], "pregunta": "¿Este cliente tiene cuentas por cobrar pendientes?"},
    ]

    consultas_analisis = [
        "¿Cuáles son los productos con mejor rotación esta semana?",
        "¿Qué productos están cerca de su fecha de vencimiento o con bajo stock?",
        "¿Cómo se compara la venta de hoy contra el promedio del mes?",
        "Dame 3 recomendaciones para mejorar el margen de ganancia.",
        "¿Qué departamento o línea de producto está generando más mermas?",
    ]

    contador = 0

    print()
    print("  ── Guía de VENTAS (Agente ALO) ──")
    for consulta in consultas_ventas:
        contador += 1
        pregunta = consulta.get("pregunta", "(consulta de contexto)")
        r = session.post(f"{BASE_URL}/api/v1/agentes/alo", json=consulta)
        print(f"\n  [{contador}/10] Consulta a ALO")
        if r.status_code == 200:
            respuesta_agente("ALO (Ventas)", pregunta, r.json())
        else:
            err(f"Consulta #{contador} a ALO falló ({r.status_code}): {r.text}")
        time.sleep(0.05)

    print()
    print("  ── Guía de ANÁLISIS (Agente VALE) ──")
    for pregunta in consultas_analisis:
        contador += 1
        r = session.post(f"{BASE_URL}/api/v1/agentes/vale", json={"pregunta": pregunta})
        print(f"\n  [{contador}/10] Consulta a VALE")
        if r.status_code == 200:
            respuesta_agente("VALE (Análisis)", pregunta, r.json())
        else:
            err(f"Consulta #{contador} a VALE falló ({r.status_code}): {r.text}")
        time.sleep(0.05)

    # ------------------------------------------------------------------
    # RESUMEN FINAL
    # ------------------------------------------------------------------
    titulo("RESUMEN FINAL DE LA SIMULACIÓN", "🏁")
    print(f"  👥 Clientes registrados : {len(clientes_creados)} / 5")
    print(f"  🛒 Compras simuladas    : {len(compras_simuladas)} / 4")
    print(f"  💵 Total facturado      : ${total_usd_acumulado:.2f} USD")
    print(f"  📚 Consultas a guías    : {contador} / 10")
    print()
    print("█" * ANCHO)
    print("  SIMULACIÓN COMPLETADA".center(ANCHO))
    print("█" * ANCHO)


if __name__ == "__main__":
    main()
