import sys
import os
import json
import urllib.request
import urllib.error

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.db.session import SessionLocal
from app.models.usuario import Usuario
from app.core.security import crear_access_token

def test_pedidos_and_compras():
    db = SessionLocal()
    try:
        # Get active user for token generation (Rol: propietario)
        user = db.query(Usuario).filter(Usuario.rol == "propietario").first()
        if not user:
            print("No se encontró usuario propietario en la base de datos.")
            return
        
        # Generate token
        token_data = {"sub": str(user.id), "eid": user.empresa_id, "rol": user.rol}
        token = crear_access_token(token_data)
        
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        
        base_url = "http://127.0.0.1:8000/api/v1"

        print("--- PROBANDO ENDPOINTS DE DELIVERY ---")

        # 1. Create a delivery order (POST /pedidos)
        delivery_data = {
            "cliente_nombre": "Yhonder Panchano",
            "cliente_telefono": "+584141234567",
            "cliente_direccion": "Alto Barinas Norte",
            "vehiculo_id": 1,
            "chofer_cedula": "V-33333333",
            "origen": "Sede Principal - Av. 23 de Enero, Barinas",
            "origen_lat": 8.6226,
            "origen_lng": -70.2075,
            "destino": "Barrio Alto Barinas, Barinas",
            "destino_lat": 8.6502,
            "destino_lng": -70.1950,
            "distancia_km": 3.45,
            "eta_min": 15,
            "estado": "CREADO",
            "metodo_pago": "Pago Móvil",
            "monto_total": 45.50,
            "notas": "Tocar timbre fuerte"
        }
        
        req = urllib.request.Request(
            f"{base_url}/pedidos",
            data=json.dumps(delivery_data).encode("utf-8"),
            headers=headers,
            method="POST"
        )
        
        try:
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                print(f"Pedido de Delivery creado con éxito! ID: {data['id']}")
                print(f"Coordenadas calculadas -> X: {data['coord_x']}, Y: {data['coord_y']}")
                assert data["cliente_nombre"] == "Yhonder Panchano"
                assert data["coord_x"] > 0
                assert data["coord_y"] > 0
        except urllib.error.HTTPError as e:
            print(f"Error en POST /pedidos: {e.code} - {e.read().decode('utf-8')}")
            return

        # 2. Get delivery orders (GET /pedidos)
        req = urllib.request.Request(f"{base_url}/pedidos", headers=headers, method="GET")
        try:
            with urllib.request.urlopen(req) as resp:
                listado = json.loads(resp.read().decode("utf-8"))
                print(f"Pedidos de delivery listados: {len(listado)}")
                assert len(listado) > 0
                assert listado[-1]["cliente_nombre"] == "Yhonder Panchano"
        except urllib.error.HTTPError as e:
            print(f"Error en GET /pedidos: {e.code} - {e.read().decode('utf-8')}")
            return


        print("--- PROBANDO ENDPOINTS DE COMPRAS ---")

        # 3. Create a purchase order (POST /pedidos/guardar-auditado)
        purchase_data = {
            "proveedor": "Distribuidora Polar",
            "items": [
                {"nombre": "Harina PAN 1kg", "cantidad": 120.0, "costo": 1.10},
                {"nombre": "Margarina Mavesa 500g", "cantidad": 50.0, "costo": 1.45}
            ]
        }
        
        req = urllib.request.Request(
            f"{base_url}/pedidos/guardar-auditado",
            data=json.dumps(purchase_data).encode("utf-8"),
            headers=headers,
            method="POST"
        )
        
        try:
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                print(f"Orden de Compra creada con éxito! ID: {data['id']}")
                assert data["proveedor"] == "Distribuidora Polar"
                assert data["items_count"] == 2
                assert round(data["total_usd"], 2) == 204.50
        except urllib.error.HTTPError as e:
            print(f"Error en POST /pedidos/guardar-auditado: {e.code} - {e.read().decode('utf-8')}")
            return

        # 4. Get purchase orders (GET /pedidos/ordenes)
        req = urllib.request.Request(f"{base_url}/pedidos/ordenes", headers=headers, method="GET")
        try:
            with urllib.request.urlopen(req) as resp:
                listado = json.loads(resp.read().decode("utf-8"))
                print(f"Órdenes de compra listadas: {len(listado)}")
                assert len(listado) > 0
                assert listado[0]["proveedor"] == "Distribuidora Polar"
        except urllib.error.HTTPError as e:
            print(f"Error en GET /pedidos/ordenes: {e.code} - {e.read().decode('utf-8')}")
            return

        print("--- TODOS LOS TESTS PASARON EXITOSAMENTE ---")

    except Exception as e:
        print(f"Falla en el test: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    test_pedidos_and_compras()
