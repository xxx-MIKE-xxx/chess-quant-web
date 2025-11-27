from http.server import BaseHTTPRequestHandler
import json
import os
import sys
import numpy as np
import onnxruntime as ort
import pandas as pd

# Path setup for imports if needed
sys.path.append(os.path.dirname(os.path.realpath(__file__)))

# --- LOAD ONNX MODEL (Lightweight) ---
model_file = 'model.onnx'
model_path = os.path.join(os.path.dirname(__file__), model_file)

onnx_session = None

try:
    if os.path.exists(model_path):
        onnx_session = ort.InferenceSession(model_path)
        print(f"✅ [Init] ONNX model loaded. Inputs: {onnx_session.get_inputs()[0].name}")
    else:
        print(f"⚠️ [Init] Model not found at {model_path}")
except Exception as e:
    print(f"❌ [Init] Failed to load ONNX: {e}")

# --- FEATURE ENGINEERING (Re-implement simple logic or import from SDK if clean) ---
# To keep dependencies light, we re-implement the feature extraction wrapper here
# or ensure tilt_model_sdk.py doesn't import xgboost at the top level.

def preprocess_and_predict(games):
    if not onnx_session:
        raise Exception("Model not initialized")

    # 1. Convert JSON to DataFrame (same as before)
    # NOTE: You can reuse your tilt_model_sdk.py logic IF you remove 'import xgboost' from the top of that file.
    # For safety, I will assume we call the SDK but wrap the import.
    from tilt_model_sdk import TiltModel
    
    # Initialize helper just for data processing methods
    helper = TiltModel() 
    df = helper._enrich_json(games)
    
    if df.empty:
        return 0.0
        
    # 2. Extract Features
    # Ensure this matches the training order EXACTLY
    X = df[helper.feature_cols].values.astype(np.float32)
    
    # 3. ONNX Inference
    input_name = onnx_session.get_inputs()[0].name
    # ONNX returns a list of outputs (usually [label, probabilities])
    # XGBoost converted models usually return [label, probability_tensor]
    inputs = {input_name: X}
    
    # Run prediction
    # Result format depends on converter, usually [label, probs]
    # For XGBoost binary classifier:
    # res[0] = label (0 or 1)
    # res[1] = probability map (list of dicts) OR raw probability tensor
    res = onnx_session.run(None, inputs)
    
    # Extract probability of class 1 (Tilt)
    # The structure of `res` varies slightly by converter version. 
    # Usually res[1] is a list of maps: [{0: 0.9, 1: 0.1}, ...]
    probs = res[1] 
    last_game_prob = probs[-1][1] # Probability of class 1 for the last row
    
    return float(last_game_prob)

class handler(BaseHTTPRequestHandler):
    def _set_headers(self, status=200):
        self.send_response(status)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*') 
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.end_headers()

    def do_OPTIONS(self):
        self._set_headers(200)

    def do_POST(self):
        try:
            content_len = int(self.headers.get('content-length', 0))
            body = self.rfile.read(content_len)
            payload = json.loads(body)
            games = payload.get("games", [])

            if not games:
                self._set_headers(200)
                self.wfile.write(json.dumps({"stop_probability": 0.0}).encode('utf-8'))
                return

            score = preprocess_and_predict(games)
            
            self._set_headers(200)
            self.wfile.write(json.dumps({
                "stop_probability": score, 
                "should_stop": score > 0.5
            }).encode('utf-8'))
            
        except Exception as e:
            print(f"Runtime Error: {e}")
            self._set_headers(500)
            self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))