from http.server import BaseHTTPRequestHandler
import json
import sys
import os

# Add the current directory to Python's path so it finds the SDK
sys.path.append(os.path.dirname(os.path.realpath(__file__)))

from api.train.train_model_sdk import TiltModel

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_len = int(self.headers.get('content-length', 0))
        body = self.rfile.read(content_len)
        
        try:
            payload = json.loads(body)
            games = payload.get("games", [])
            user_id = payload.get("user_id", "default")

            if len(games) < 10:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b'{"error": "Need at least 10 games to train"}')
                return

            # 1. Initialize & Train
            print(f"Training personal model for {user_id} on {len(games)} games...")
            tilt_ai = TiltModel(user_id=user_id)
            tilt_ai.train(games)

            # 2. Serialize to Base64
            model_b64 = tilt_ai.to_base64()
            
            # 3. Return the "Brain"
            response = {
                "success": True,
                "model_b64": model_b64,
                "games_used": len(games)
            }

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(response).encode('utf-8'))
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            error_msg = {"error": str(e)}
            self.wfile.write(json.dumps(error_msg).encode('utf-8'))