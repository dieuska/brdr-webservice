import json
import threading
import time

import requests

from brdr_webservice import start_server, port

base_url = f"http://localhost:{port}"

# Start the web service in a separate thread
thread = threading.Thread(target=start_server, daemon=True)
thread.start()

# Wait a moment for the server to start
time.sleep(2)

# Make a call to the web service
url = base_url + "/aligner?result_mode=all"

with open("body.json", "r") as f:
    request_body = json.load(f)
response = requests.post(url, json=request_body, timeout=120)
response.raise_for_status()
payload = response.json()

print("status:", response.status_code)
print("keys:", list(payload.keys()))
print("steps:", len(payload.get("series", {})))
print(
    "predictions:",
    sum(1 for v in payload.get("predictions", {}).values() if bool(v)),
)
