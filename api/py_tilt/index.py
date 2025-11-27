from http.server import BaseHTTPRequestHandler
import json
import os
import sys

# 1. Explicitly set path so Python finds the SDK in the same folder
sys.path.append(os.path.dirname(os.path.realpath(__file__)))

# FIX: Direct import because we added the path above
from tilt_model_sdk import TiltModel

# --- WARM START ---
# Load the global model once when the server boots
model_file = 'model.json'
model_path = os.path.join(os.path.dirname(__file__), model_file)

global_tilt_ai = TiltModel()

try:
    if os.path.exists(model_path):
        global_tilt_ai.load(model_path)
        print(f"Global model '{model_file}' loaded successfully.")
    else:
        print(f"Warning: Global model '{model_file}' not found on disk.")
except Exception as e:
    print(f"Error loading global model: {e}")

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            content_len = int(self.headers.get('content-length', 0))
            body = self.rfile.read(content_len)
            payload = json.loads(body)
            
            # Input: List of PRE-ANALYZED games from the browser
            games = payload.get("games", [])
            personal_model_b64 = payload.get("personal_model", None)
            
            # 1. Determine which brain to use
            tilt_ai = None
            
            if personal_model_b64:
                try:
                    # Attempt to load user-specific fine-tuned model
                    temp_ai = TiltModel()
                    if hasattr(temp_ai, 'load_from_base64'):
                        temp_ai.load_from_base64(personal_model_b64)
                        if temp_ai.model is not None:
                            tilt_ai = temp_ai
                            print("Using Personal Model.")
                except Exception as e:
                    print(f"Failed to load personal model string: {e}")

            # Fallback to global model
            if tilt_ai is None:
                if global_tilt_ai.model is not None:
                    tilt_ai = global_tilt_ai
                else:
                    # Failsafe: No models available
                    print("No models available. Returning neutral score.")
                    self.send_json(200, {
                        "stop_probability": 0.0, 
                        "reason": "System initializing (Model not loaded)",
                        "should_stop": False
                    })
                    return

            # 2. Validate Data
            if not games:
                self.send_json(200, {
                    "stop_probability": 0.0, 
                    "reason": "No games provided",
                    "should_stop": False
                })
                return

            # 3. Predict
            result = tilt_ai.predict(games)
            
            if result is None:
                 self.send_json(200, {
                    "stop_probability": 0.0, 
                    "reason": "Insufficient data for analysis",
                    "should_stop": False
                })
                 return

            self.send_json(200, result)
            
        except Exception as e:
            print(f"CRITICAL ERROR: {str(e)}")
            # Send 500 so the frontend knows something broke
            self.send_json(500, {"error": str(e)})

    def send_json(self, status, data):
        self.send_response(status)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))