import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from app.main import app, get_db
from app.db.session import SessionLocal
from app.models.usuario import Usuario
from app.models.ticket import Ticket
from app.models.cliente import Cliente
from app.models.producto import Producto
from app.core.security import crear_access_token

def test_survey_endpoints():
    db = SessionLocal()
    try:
        # Get active user for token generation (Rol: propietario)
        user = db.query(Usuario).filter(Usuario.rol == "propietario").first()
        if not user:
            print("No se encontró usuario propietario en la base de datos.")
            return
        
        # Generate token
        token_data = {"sub": user.email, "usuario_id": user.id, "eid": user.empresa_id, "rol": user.rol}
        token = crear_access_token(token_data)
        headers = {"Authorization": f"Bearer {token}"}
        
        client = TestClient(app)
        
        # Ensure there is a client and a ticket in the db to survey
        cliente = db.query(Cliente).filter(Cliente.empresa_id == user.empresa_id).first()
        if not cliente:
            print("No hay clientes en la DB.")
            return
            
        ticket = db.query(Ticket).filter(Ticket.cliente_id == cliente.id, Ticket.empresa_id == user.empresa_id).first()
        if not ticket:
            print("No hay tickets en la DB para este cliente.")
            return

        print(f"Probando encuesta para Ticket ID: {ticket.id}, Cliente ID: {cliente.id}")

        # 1. Test POST /api/v1/crm/postventa-logs (Crear Encuesta)
        survey_data = {
            "ticket_id": ticket.id,
            "tipo_mensaje": "encuesta_calidad",
            "respuesta_cliente": "Estaba dura / mala: La carne de la carnicería vino muy dura.",
            "status_envio": "pendiente"
        }
        response = client.post("/api/v1/crm/postventa-logs", json=survey_data, headers=headers)
        assert response.status_code == 201, f"Error creating survey: {response.text}"
        data = response.json()
        log_id = data["id"]
        print(f"Encuesta creada exitosamente! Log ID: {log_id}")
        assert data["status_envio"] == "pendiente"
        assert "Estaba dura" in data["respuesta_cliente"]

        # 2. Test GET /api/v1/crm/postventa-logs (Filtrar por cliente y pendiente)
        response = client.get(
            "/api/v1/crm/postventa-logs",
            params={"cliente_id": cliente.id, "status_envio": "pendiente"},
            headers=headers
        )
        assert response.status_code == 200, f"Error listing logs: {response.text}"
        logs = response.json()
        print(f"Encontrados {len(logs)} logs pendientes para el cliente.")
        assert len(logs) > 0
        assert logs[0]["id"] == log_id

        # 3. Test PUT /api/v1/crm/postventa-logs/{log_id} (Resolver Encuesta)
        update_data = {
            "status_envio": "resuelto",
            "respuesta_cliente": data["respuesta_cliente"] + " [Resuelto en Caja: Se le dio un descuento de 10%]"
        }
        response = client.put(f"/api/v1/crm/postventa-logs/{log_id}", json=update_data, headers=headers)
        assert response.status_code == 200, f"Error resolving survey: {response.text}"
        resolved_data = response.json()
        print("Encuesta resuelta exitosamente!")
        assert resolved_data["status_envio"] == "resuelto"
        assert "Resuelto en Caja" in resolved_data["respuesta_cliente"]

        # 4. Test GET /api/v1/crm/postventa-logs to check it's no longer pending
        response = client.get(
            "/api/v1/crm/postventa-logs",
            params={"cliente_id": cliente.id, "status_envio": "pendiente"},
            headers=headers
        )
        assert response.status_code == 200
        logs = response.json()
        print(f"Logs pendientes después de resolver: {len(logs)}")
        # Check that our resolved log is not in the pending list
        assert not any(l["id"] == log_id for l in logs)

        print("--- TODOS LOS TESTS PASARON EXITOSAMENTE ---")

    except Exception as e:
        print(f"Falla en el test: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    test_survey_endpoints()
