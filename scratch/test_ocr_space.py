import urllib.request
import urllib.parse
import json
import base64

# A tiny 1x1 white pixel gif to test base64 upload
test_base64 = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"

url = "https://api.ocr.space/parse/image"
data = urllib.parse.urlencode({
    "apikey": "helloworld",
    "language": "spa",
    "base64Image": test_base64
}).encode("utf-8")

req = urllib.request.Request(
    url,
    data=data,
    headers={
        "Content-Type": "application/x-www-form-urlencoded"
    },
    method="POST"
)

try:
    with urllib.request.urlopen(req, timeout=10) as response:
        res = json.loads(response.read().decode("utf-8"))
        print("OCR SUCCESS:")
        print(json.dumps(res, indent=2))
except Exception as e:
    print(f"Error: {e}")
