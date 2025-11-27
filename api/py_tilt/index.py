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

    from tilt_model_sdk import TiltModel
    
    helper = TiltModel() 
    df = helper._enrich_json(games)
    
    if df.empty:
        return 0.0

    # ... logging code (optional) ...

    X = df[helper.feature_cols].values.astype(np.float32)
    
    input_name = onnx_session.get_inputs()[0].name
    inputs = {input_name: X}
    
    res = onnx_session.run(None, inputs)
    
    # res[0] is usually labels
    # res[1] is probabilities
    probs = res[1] 
    
    # --- ROBUST PROBABILITY EXTRACTION ---
    try:
        # Case 1: NumPy Array (Standard for XGBoost -> ONNX without ZipMap)
        # Shape is usually (N_rows, 2_classes). We want last row, 2nd column (Class 1)
        if hasattr(probs, 'shape'):
            last_game_prob = probs[-1, 1]
            
        # Case 2: List of Dictionaries (Standard for sklearn-onnx with ZipMap)
        # Structure: [{0: 0.9, 1: 0.1}, ...]
        elif isinstance(probs, list):
            last_game_prob = probs[-1][1]
            
        # Case 3: Single Dictionary (Edge case)
        elif isinstance(probs, dict):
            last_game_prob = probs[1]
            
        else:
            print(f"Unknown probability format: {type(probs)}")
            last_game_prob = 0.0

    except Exception as e:
        print(f"Error parsing probability: {e}. Raw data: {probs}")
        last_game_prob = 0.0

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
                self.wfile.write(json.dumps({"stop_probability": 0.0, "tilt_score": 0.0}).encode('utf-8'))
                return

            score = preprocess_and_predict(games)
            
            self._set_headers(200)
            # FIX: Add "tilt_score" to match what page.tsx expects
            self.wfile.write(json.dumps({
                "tilt_score": score,        # <--- The frontend needs this!
                "stop_probability": score,  # Keep this for clarity
                "should_stop": score > 0.5
            }).encode('utf-8'))
            
        except Exception as e:
            print(f"Runtime Error: {e}")
            self._set_headers(500)
            self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))