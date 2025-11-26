import sys
import os
import pandas as pd
import numpy as np
from pathlib import Path # <--- Added this import

# Fix path to find sdk in the api/py_tilt folder
sys.path.append(os.path.join(os.path.dirname(__file__), '../api/py_tilt'))

from tilt_model_sdk import TiltModel

print("Regenerating robust global model...")

# --- CONFIG ---
games_to_generate = 100
games_per_session = 5
start_time = 1672531200000 # Arbitrary start timestamp

mock_games = []

for i in range(games_to_generate):
    # 1. Create Timestamp
    # Standard gap: 10 mins
    # Session gap: Every 5 games, jump forward 2 hours to force new sessions
    session_jump = (i // games_per_session) * 7200000 
    game_gap = i * 600000
    
    current_time = start_time + game_gap + session_jump

    # 2. Simulate "Tilt" behavior for alternating sessions
    # If session ID is even, play bad (high ACPL, fast moves) -> likely to trigger target
    session_id = i // games_per_session
    is_bad_session = session_id % 2 == 0
    
    acpl = 80 if is_bad_session else 20
    blunder = 2 if is_bad_session else 0
    # "Tilt" speed (10s) vs "Focus" speed (30s)
    move_speed = 10 if is_bad_session else 30 
    
    # Simulate Mock PGN clock string
    moves_str = f"[%clk 0:00:{move_speed}] " * 20

    mock_games.append({
        "createdAt": current_time,
        "players": {
            "white": {
                "user": {"name": "hero"}, 
                "analysis": {"acpl": acpl, "blunder": blunder}
            },
            "black": {
                "user": {"name": "villain"}
            }
        },
        "moves": moves_str,
        "winner": "black" if is_bad_session else "white"
    })

print(f"Generated {len(mock_games)} mock games across {games_to_generate // games_per_session} sessions.")

# 3. Train
model = TiltModel(user_id="hero")
model.train(mock_games)

# 4. Save
# FIX: Wrap strings in Path() objects so the SDK can use .parent
paths = [
    Path("api/py_tilt/model.joblib"),
    Path("api/train/model.joblib")
]

for p in paths:
    # Ensure directory exists (SDK does this too, but good safety)
    os.makedirs(p.parent, exist_ok=True)
    model.save(p)
    print(f"Saved artifact to: {p}")

print("✅ Success! Model regenerated.")