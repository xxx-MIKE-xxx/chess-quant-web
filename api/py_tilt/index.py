from http.server import BaseHTTPRequestHandler
import json
import os
import sys

# Explicit path setup
sys.path.append(os.path.dirname(os.path.realpath(__file__)))

from tilt_model_sdk import TiltModel

# --- WARM START ---
model_path = os.path.join(os.path.dirname(__file__), 'model.joblib')
global_tilt_ai = TiltModel()

# Try to load global model, but don't crash if missing
try:
    if os.path.exists(model_path):
        global_tilt_ai.load(model_path)
        print("Global model loaded.")
    else:
        print("Global model artifact not found on disk.")
except Exception as e:
    print(f"Error loading global model: {e}")

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_len = int(self.headers.get('content-length', 0))
        body = self.rfile.read(content_len)
        
        try:
            payload = json.loads(body)
            games = payload.get("games", [])
            personal_model_b64 = payload.get("personal_model", None)
            
            # 1. Determine which brain to use
            tilt_ai = None
            
            if personal_model_b64:
                try:
                    # Load specific user brain
                    temp_ai = TiltModel()
                    temp_ai.load_from_base64(personal_model_b64)
                    if temp_ai.model is not None:
                        tilt_ai = temp_ai
                        print("Using Personal Model.")
                except Exception as e:
                    print(f"Failed to load personal model string: {e}")

            # Fallback to global if personal failed or didn't exist
            if tilt_ai is None:
                if global_tilt_ai.model is not None:
                    tilt_ai = global_tilt_ai
                    print("Using Global Model.")
                else:
                    # CASE: No personal model AND no global model found
                    # We return a "Neutral" response instead of crashing
                    print("No models available. Returning neutral score.")
                    response = {
                        "stop_probability": 0.0, # 0.0 = No Tilt (Safe default)
                        "reason": "Calibration needed (Play more games)",
                        "metrics": {}
                    }
                    self.send_json(200, response)
                    return

            # 2. Validate Data
            if len(games) < 3:
                self.send_json(200, {
                    "stop_probability": 0.0, 
                    "reason": "Need more recent games to analyze"
                })
                return

            # 3. Predict
            result = tilt_ai.predict_latest(games)
            self.send_json(200, result)
            
        except Exception as e:
            print(f"CRITICAL ERROR: {str(e)}")
            self.send_json(500, {"error": str(e)})

    def send_json(self, status, data):
        self.send_response(status)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))