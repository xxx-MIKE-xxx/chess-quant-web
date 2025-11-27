from http.server import BaseHTTPRequestHandler
import json
import os
import sys

# 1. Path Setup
sys.path.append(os.path.dirname(os.path.realpath(__file__)))

# 2. Imports
try:
    from tilt_model_sdk import TiltModel
    # Initialize global model on cold start
    global_tilt_ai = TiltModel()
    model_path = os.path.join(os.path.dirname(__file__), 'model.json')
    
    if os.path.exists(model_path):
        global_tilt_ai.load(model_path)
        print("✅ [Init] Global model loaded.")
    else:
        print(f"⚠️ [Init] Model file not found at: {model_path}")
        
except ImportError as e:
    print(f"❌ [Init] Critical Import Error: {e}")
    global_tilt_ai = None

class handler(BaseHTTPRequestHandler):
    
    # --- HELPER: CORS & HEADERS ---
    def _set_headers(self, status=200):
        self.send_response(status)
        self.send_header('Content-type', 'application/json')
        # CRITICAL: Allow CORS for your frontend
        self.send_header('Access-Control-Allow-Origin', '*') 
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    # --- HANDLE PREFLIGHT (The fix for 405) ---
    def do_OPTIONS(self):
        self._set_headers(200)

    def do_POST(self):
        try:
            if not global_tilt_ai:
                 self._set_headers(500)
                 self.wfile.write(json.dumps({"error": "Server configuration error: Modules not loaded"}).encode('utf-8'))
                 return

            content_len = int(self.headers.get('content-length', 0))
            body = self.rfile.read(content_len)
            payload = json.loads(body)
            
            games = payload.get("games", [])
            personal_model_b64 = payload.get("personal_model", None)

            # 1. Select Model
            tilt_ai = global_tilt_ai
            
            # (Optional: Add personal model logic here if needed, keeping it simple for stability)

            # 2. Predict
            if not games:
                self._set_headers(200)
                self.wfile.write(json.dumps({
                    "stop_probability": 0.0, 
                    "reason": "No games provided",
                    "should_stop": False
                }).encode('utf-8'))
                return

            result = tilt_ai.predict(games)
            
            self._set_headers(200)
            self.wfile.write(json.dumps(result).encode('utf-8'))
            
        except Exception as e:
            print(f"❌ [Runtime Error] {str(e)}")
            self._set_headers(500)
            error_response = json.dumps({"error": str(e)})
            self.wfile.write(error_response.encode('utf-8'))