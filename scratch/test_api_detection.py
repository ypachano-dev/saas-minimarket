import urllib.request
import json
import base64
import os

def test_detection():
    # Construct mock token bypass
    header = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    payload_obj = {"rol": "propietario", "sub": "ypachano", "name": "Yhonder Pachano"}
    
    payload_json = json.dumps(payload_obj).encode("utf-8")
    payload_encoded = base64.b64encode(payload_json).decode("utf-8").replace("=", "")
    mock_token = f"{header}.{payload_encoded}.signature_demo"
    
    front_photo_path = r"C:\Users\YHONDER\.gemini\antigravity-ide\brain\9f562147-6f60-491e-88af-1a50d3cb22f5\media__1782000787118.jpg"
    
    print("Sending request to /api/v1/productos/analizar-foto with Chicco front photo...")
    
    try:
        # Read the image bytes
        with open(front_photo_path, "rb") as f:
            img_bytes = f.read()
            
        # Build multipart form data manually
        boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
        body = []
        
        # File field
        body.append(f"--{boundary}".encode("utf-8"))
        body.append('Content-Disposition: form-data; name="foto_frontal"; filename="media__1782000787118.jpg"'.encode("utf-8"))
        body.append('Content-Type: image/jpeg'.encode("utf-8"))
        body.append(b"") # Empty line before data
        body.append(img_bytes)
        
        # Closing boundary
        body.append(f"--{boundary}--".encode("utf-8"))
        body.append(b"")
        
        body_bytes = b"\r\n".join(body)
        
        req = urllib.request.Request(
            "http://localhost:8000/api/v1/productos/analizar-foto",
            data=body_bytes,
            headers={
                "Authorization": f"Bearer {mock_token}",
                "Content-Type": f"multipart/form-data; boundary={boundary}",
                "Content-Length": str(len(body_bytes))
            },
            method="POST"
        )
        
        with urllib.request.urlopen(req, timeout=10) as response:
            status_code = response.status
            print(f"Status Code: {status_code}")
            
            resp_data = response.read().decode("utf-8")
            data = json.loads(resp_data)
            print("Response JSON:")
            print(json.dumps(data, indent=2, ensure_ascii=False))
            
            # Assertions to verify correctness
            assert data.get("codigo_barras") == "7591061640135", "Incorrect EAN"
            assert data.get("nombre") == "Loción con Aceite de Almendras", "Incorrect Name"
            assert data.get("marca") == "Chicco", "Incorrect Brand"
            assert data.get("peso") == 200.0, "Incorrect Volume (should be 200 ml)"
            assert data.get("costo_usd") is None, "Costo USD should be None"
            assert data.get("precio_1_detalle") is None, "Precio 1 should be None"
            assert data.get("precio_2_mayorista") is None, "Precio 2 should be None"
            assert data.get("precio_3_especial") is None, "Precio 3 should be None"
            assert data.get("fecha_vencimiento") == "2028-09-30", "Incorrect Expiration Date"
            print("\nALL VERIFICATIONS PASSED SUCCESSFULLY! ✅")
            
    except Exception as e:
        print(f"Failed to connect or verify: {e}")
        if hasattr(e, 'read'):
            print(f"Error detail: {e.read().decode('utf-8')}")

if __name__ == "__main__":
    test_detection()
