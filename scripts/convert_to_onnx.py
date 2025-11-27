# scripts/convert_to_onnx.py
import sys
import os
import json
import pandas as pd
import numpy as np
import xgboost as xgb
from onnxmltools import convert_xgboost
from onnxmltools.convert.common.data_types import FloatTensorType

# Fix paths to find your SDK
sys.path.append(os.path.join(os.path.dirname(__file__), '../api/py_tilt'))
from tilt_model_sdk import TiltModel

def convert():
    print("--- 🔄 Loading XGBoost Model ---")
    tilt_ai = TiltModel()
    # Ensure this path points to your model.json or model.joblib
    model_path = os.path.join(os.path.dirname(__file__), '../api/py_tilt/model.json')
    
    if not os.path.exists(model_path):
        print(f"❌ Model not found at {model_path}")
        return

    tilt_ai.load(model_path)
    xgb_model = tilt_ai.model
    
    # --- CRITICAL FIX: STRIP FEATURE NAMES ---
    # The converter crashes if it sees string names like "games_played".
    # We force it to use indices (f0, f1, f2) by clearing the names.
    print("--- ✂️  Stripping feature names for ONNX compatibility ---")
    xgb_model.get_booster().feature_names = None
    
    # Define input shape based on the number of features
    n_features = len(tilt_ai.feature_cols)
    print(f"Features detected: {n_features}")
    
    # Define the input type for ONNX (Float Tensor)
    initial_types = [('float_input', FloatTensorType([None, n_features]))]
    
    print("--- 📦 Converting to ONNX ---")
    onnx_model = convert_xgboost(xgb_model, initial_types=initial_types)
    
    output_path = os.path.join(os.path.dirname(__file__), '../api/py_tilt/model.onnx')
    with open(output_path, "wb") as f:
        f.write(onnx_model.SerializeToString())
        
    print(f"✅ Success! Saved to {output_path}")

if __name__ == "__main__":
    convert()