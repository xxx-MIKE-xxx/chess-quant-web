from http.server import BaseHTTPRequestHandler
import json
import os
from tilt_model_sdk import TiltModel

# --- WARM START (Global Model) ---
# We keep the global model loaded as a fallback
model_path = os.path.join(os.path.dirname(__file__), 'model.joblib')
global_tilt_ai = TiltModel()
try:
    global_tilt_ai.load(model_path)
except:
    print("Global model not found.")

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_len = int(self.headers.get('content-length', 0))
        body = self.rfile.read(content_len)
        
        try:
            payload = json.loads(body)
            games = payload.get("games", [])
            
            # NEW: Check for personal model
            personal_model_b64 = payload.get("personal_model", None)
            
            # Decide which brain to use
            if personal_model_b64:
                # Load specific user brain
                tilt_ai = TiltModel()
                tilt_ai.load_from_base64(personal_model_b64)
            else:
                # Use global brain
                tilt_ai = global_tilt_ai

            if len(games) < 3:
                self.send_error(400, "Need at least 3 games")
                return

            result = tilt_ai.predict_latest(games)
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode('utf-8'))
            
        except Exception as e:
            self.send_response(500)
            self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))