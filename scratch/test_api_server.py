import sys
import os
import json
import urllib.request
import urllib.error

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.db.session import SessionLocal
from app.models.usuario import Usuario
from app.models.ticket import Ticket
from app.models.cliente import Cliente
from app.core.security import crear_access_token

def test_survey_live_api():
    db = SessionLocal()
    try:
        # Get active user for token generation (Rol: propietario)
        user = db.query(Usuario).filter(Usuario.rol == "propietario").first()
        if not user:
            print("No se encontró usuario propietario en la base de datos.")
            return
        
        # Generate token
        # Note: in get_current_user:
        # usuario_id = payload.get("sub")
        # eid = payload.get("eid")
        # rol = payload.get("rol")
        token_data = {"sub": str(user.id), "eid": user.empresa_id, "rol": user.rol}
        token = crear_access_token(token_data)
        
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

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        
        base_url = "http://127.0.0.1:8000/api/v1"

        # 1. Create survey (POST /crm/postventa-logs)
        survey_data = {
            "ticket_id": ticket.id,
            "tipo_mensaje": "encuesta_calidad",
            "respuesta_cliente": "Estaba dura / mala: La carne de la carnicería vino muy dura.",
            "status_envio": "pendiente"
        }
        
        req = urllib.request.Request(
            f"{base_url}/crm/postventa-logs",
            data=json.dumps(survey_data).encode("utf-8"),
            headers=headers,
            method="POST"
        )
        
        try:
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                log_id = data["id"]
                print(f"Encuesta creada exitosamente! Log ID: {log_id}")
                assert data["status_envio"] == "pendiente"
                assert "Estaba dura" in data["respuesta_cliente"]
        except urllib.error.HTTPError as e:
            print(f"Error en POST: {e.code} - {e.read().decode('utf-8')}")
            return

        # 2. Get surveys for client (GET /crm/postventa-logs)
        url = f"{base_url}/crm/postventa-logs?cliente_id={cliente.id}&status_envio=pendiente"
        req = urllib.request.Request(url, headers=headers, method="GET")
        
        try:
            with urllib.request.urlopen(req) as resp:
                logs = json.loads(resp.read().decode("utf-8"))
                print(f"Encontrados {len(logs)} logs pendientes para el cliente.")
                assert len(logs) > 0
                assert logs[0]["id"] == log_id
        except urllib.error.HTTPError as e:
            print(f"Error en GET: {e.code} - {e.read().decode('utf-8')}")
            return

        # 3. Resolve survey (PUT /crm/postventa-logs/{log_id})
        update_data = {
            "status_envio": "resuelto",
            "respuesta_cliente": data["respuesta_cliente"] + " [Resuelto en Caja: Se le dio un descuento de 10%]"
        }
        
        req = urllib.request.Request(
            f"{base_url}/crm/postventa-logs/{log_id}",
            data=json.dumps(update_data).encode("utf-8"),
            headers=headers,
            method="PUT"
        )
        
        try:
            with urllib.request.urlopen(req) as resp:
                resolved_data = json.loads(resp.read().decode("utf-8"))
                print("Encuesta resuelta exitosamente!")
                assert resolved_data["status_envio"] == "resuelto"
                assert "Resuelto en Caja" in resolved_data["respuesta_cliente"]
        except urllib.error.HTTPError as e:
            print(f"Error en PUT: {e.code} - {e.read().decode('utf-8')}")
            return

        # 4. Get surveys again to verify it is no longer pending
        req = urllib.request.Request(url, headers=headers, method="GET")
        try:
            with urllib.request.urlopen(req) as resp:
                logs = json.loads(resp.read().decode("utf-8"))
                print(f"Logs pendientes después de resolver: {len(logs)}")
                assert not any(l["id"] == log_id for l in logs)
        except urllib.error.HTTPError as e:
            print(f"Error en GET de confirmación: {e.code} - {e.read().decode('utf-8')}")
            return

        print("--- TODOS LOS TESTS PASARON EXITOSAMENTE ---")

    except Exception as e:
        print(f"Falla en el test: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    test_survey_live_api()
