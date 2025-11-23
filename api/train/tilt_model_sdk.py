import re
import json
import joblib
import pandas as pd
import numpy as np
import io
import base64
from pathlib import Path
from sklearn.ensemble import HistGradientBoostingClassifier

# --------------------------------------------------------------------------
# CONFIGURATION
# --------------------------------------------------------------------------
MODEL_ARTIFACT_PATH = Path("assets/tilt_model_production.joblib")
MIN_TRAINING_SESSIONS = 3
WINDOW_SIZES = [3, 5]

# --------------------------------------------------------------------------
# 1. FEATURE EXTRACTOR (The Bridge between JSON and ML)
# --------------------------------------------------------------------------
class FeatureExtractor:
    """
    Converts Raw Lichess Game JSONs into the specific Feature Matrix
    required by the Pure Tilt Model.
    """
    
    @staticmethod
    def parse_clock_from_pgn(moves_str):
        """
        Extracts average move time from PGN comments like { [%clk 0:00:19] }
        """
        if not isinstance(moves_str, str):
            return 30.0 # Default assumption if missing

        # Regex to find all [%clk H:MM:SS]
        times = re.findall(r"\[%clk (\d+):(\d+):(\d+)\]", moves_str)
        
        seconds_list = []
        for h, m, s in times:
            seconds_list.append(int(h)*3600 + int(m)*60 + int(s))
        
        if not seconds_list or len(seconds_list) < 2:
            return 30.0
            
        # Calculate time spent per move (diff between clock times)
        # This is a rough approximation because it mixes white/black moves
        # But consistent approximation is enough for ML features
        diffs = np.abs(np.diff(seconds_list))
        # Filter out massive diffs (game start/end artifacts)
        diffs = diffs[diffs < 300] 
        
        if len(diffs) == 0: return 30.0
        
        return float(np.mean(diffs))

    @staticmethod
    def process_single_game(game_json, username):
        """
        Extracts core metrics (ACPL, Blunders, Speed) from one game dictionary.
        """
        # Identify Color
        is_white = game_json.get('players', {}).get('white', {}).get('user', {}).get('name') == username
        if not is_white and game_json.get('players', {}).get('black', {}).get('user', {}).get('name') != username:
            # Fallback: try to guess by user ID if name fails, or assume white
            is_white = True 

        my_color = 'white' if is_white else 'black'
        player_data = game_json.get('players', {}).get(my_color, {})
        analysis = player_data.get('analysis', {})
        
        # 1. ACPL (Accuracy)
        acpl = analysis.get('acpl', 50) # Default to 50 (Average play) if no analysis
        
        # 2. Blunders
        blunders = analysis.get('blunder', 0)
        
        # 3. Speed (Avg Seconds Per Move)
        # Try explicit field first, then parse PGN
        moves_str = game_json.get('moves', '')
        avg_time = FeatureExtractor.parse_clock_from_pgn(moves_str)
        
        # 4. Result (Used for session PL calculation, NOT for prediction features)
        winner = game_json.get('winner')
        if winner == my_color:
            pl = 5 # Approx rating gain
        elif winner is None:
            pl = 0
        else:
            pl = -5
            
        # Rating diff (better precision)
        if 'ratingDiff' in player_data:
            pl = player_data['ratingDiff']
            
        return {
            'created_at': pd.to_datetime(game_json.get('createdAt', 0), unit='ms', utc=True),
            'my_acpl': acpl,
            'my_blunder_count': blunders,
            'my_avg_secs_per_move': avg_time,
            'pl': pl
        }

    @staticmethod
    def enrich_session(games_list):
        """
        Takes a list of raw game dicts, calculates rolling features.
        Returns DataFrame ready for prediction.
        """
        # 1. Convert to basic DataFrame
        df = pd.DataFrame(games_list)
        df = df.sort_values('created_at').reset_index(drop=True)
        
        # 2. Session Grouping (Auto-detect sessions > 1h gap)
        df['time_diff'] = df['created_at'].diff()
        df['new_session'] = (df['time_diff'] > pd.Timedelta(hours=1)).astype(int)
        df['session_id'] = df['new_session'].cumsum()
        
        # 3. Rolling Features
        df_feat = df.copy()
        grp = df_feat.groupby('session_id')
        
        for w in WINDOW_SIZES:
            df_feat[f'roll_{w}_acpl_mean'] = grp['my_acpl'].transform(lambda x: x.rolling(w).mean())
            df_feat[f'roll_{w}_time_per_move'] = grp['my_avg_secs_per_move'].transform(lambda x: x.rolling(w).mean())

        # 4. Fatigue / Speed vs Start
        first_speed = grp['my_avg_secs_per_move'].transform('first')
        df_feat['speed_vs_start'] = df_feat['my_avg_secs_per_move'] / (first_speed + 1e-5)
        
        df_feat['games_played'] = df_feat.groupby('session_id').cumcount() + 1
        
        # 5. Clean NaNs (Rolling windows create NaNs at start of session)
        numeric_cols = [c for c in df_feat.columns if 'roll_' in c] + ['speed_vs_start']
        df_feat[numeric_cols] = df_feat[numeric_cols].fillna(0)
        
        return df_feat

# --------------------------------------------------------------------------
# 2. THE MODEL CLASS (Developer API)
# --------------------------------------------------------------------------
class TiltModel:
    def __init__(self, user_id="default_user"):
        self.user_id = user_id
        self.model = None
        self.feature_cols = []
        self.threshold = 0.55

    def train(self, raw_games_list):
        """
        Trains a custom model on a list of raw Lichess game dictionaries.
        """
        print(f"Processing {len(raw_games_list)} games for training...")
        
        # 1. Extract Basic Metrics
        processed_games = [FeatureExtractor.process_single_game(g, self.user_id) for g in raw_games_list]
        
        # 2. Enrich with Rolling Features
        df = FeatureExtractor.enrich_session(processed_games)
        
        # 3. Define Targets (Global Max Logic)
        df['session_cum_pl'] = df.groupby('session_id')['pl'].cumsum()
        session_max = df.groupby('session_id')['session_cum_pl'].transform('max')
        
        # Find first index of max
        df['is_max'] = (df['session_cum_pl'] == session_max)
        target_idx = df[df['is_max']].groupby('session_id').cumcount().index # Simplified logic check
        # Robust target assignment
        df['target'] = 0
        # We need the index of the first True is_max per session
        first_max_indices = df[df['is_max']].groupby('session_id').head(1).index
        df.loc[first_max_indices, 'target'] = 1
        
        # 4. Filter Training Data (Long sessions only)
        sess_counts = df['session_id'].value_counts()
        valid_sessions = sess_counts[sess_counts >= MIN_TRAINING_SESSIONS].index
        df_train = df[df['session_id'].isin(valid_sessions)].copy()
        
        # 5. Define Feature Columns (PURE TILT - NO SCORE INFO)
        self.feature_cols = [
            'my_acpl', 'my_blunder_count', 'my_avg_secs_per_move', 
            'speed_vs_start', 'games_played'
        ] + [c for c in df.columns if 'roll_' in c and 'pl' not in c]
        
        print(f"Training on {len(df_train)} games with features: {self.feature_cols}")
        
        # 6. Train
        self.model = HistGradientBoostingClassifier(
            learning_rate=0.03, max_iter=500, max_depth=5, 
            early_stopping=True, class_weight='balanced', random_state=42
        )
        self.model.fit(df_train[self.feature_cols], df_train['target'])
        print("Training complete.")

    def predict_latest(self, recent_games_list):
        """
        Predicts tilt probability for the MOST RECENT game in the list.
        """
        if self.model is None:
            # Return a safe default if model is broken/missing
            return {
                "stop_probability": 0.0,
                "should_stop": False,
                "reason": "Model not active",
                "metrics": {}
            }
            
        if not recent_games_list:
             return {
                "stop_probability": 0.0,
                "should_stop": False,
                "reason": "No recent games to analyze",
                "metrics": {}
            }

        # 1. Process
        processed_games = [FeatureExtractor.process_single_game(g, self.user_id) for g in recent_games_list]
        df_enriched = FeatureExtractor.enrich_session(processed_games)
        
        # CRITICAL FIX: Ensure all expected feature columns exist, fill with 0 if missing
        for col in self.feature_cols:
            if col not in df_enriched.columns:
                df_enriched[col] = 0.0
        
        # 2. Select Last Game
        if df_enriched.empty:
             return {
                "stop_probability": 0.0,
                "reason": "Data processing error",
                "metrics": {}
            }

        last_row = df_enriched.iloc[[-1]][self.feature_cols]
        
        # 3. Predict
        try:
            prob = self.model.predict_proba(last_row)[0, 1]
        except Exception as e:
            print(f"Prediction math failed: {e}")
            return {
                "stop_probability": 0.0,
                "reason": "Calculation error",
                "metrics": {}
            }
        
        # 4. Explain (Optional)
        speed_factor = last_row['speed_vs_start'].values[0]
        acpl = last_row['my_acpl'].values[0]
        
        reason = "Normal Play"
        if prob > self.threshold:
            if speed_factor > 1.2: reason = "Rushing (Playing too fast)"
            elif acpl > 70: reason = "Sloppy Play (High Inaccuracy)"
            else: reason = "Statistical Tilt Pattern"
            
        return {
            "stop_probability": float(prob),
            "should_stop": bool(prob > self.threshold),
            "reason": reason,
            "metrics": {
                "speed_ratio": float(speed_factor),
                "acpl": float(acpl)
            }
        }

    def save(self, path=MODEL_ARTIFACT_PATH):
        path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump({
            "model": self.model,
            "features": self.feature_cols,
            "threshold": self.threshold
        }, path)
        print(f"Model saved to {path}")

    def load(self, path=MODEL_ARTIFACT_PATH):
        data = joblib.load(path)
        self.model = data["model"]
        self.feature_cols = data["features"]
        self.threshold = data.get("threshold", 0.55)
        print("Model loaded successfully.")

    # --- NEW: Base64 Support for Database Storage ---
    def to_base64(self):
        """Serializes the trained model to a Base64 string."""
        if self.model is None: return None
        
        buffer = io.BytesIO()
        # Save the whole state (model + threshold + features)
        payload = {
            "model": self.model,
            "features": self.feature_cols,
            "threshold": self.threshold
        }
        joblib.dump(payload, buffer)
        return base64.b64encode(buffer.getvalue()).decode('utf-8')

    def load_from_base64(self, b64_str):
        """Loads the model from a Base64 string."""
        if not b64_str: return
        try:
            buffer = io.BytesIO(base64.b64decode(b64_str))
            data = joblib.load(buffer)
            self.model = data["model"]
            self.feature_cols = data["features"]
            self.threshold = data.get("threshold", 0.55)
            # print("Personal model loaded from Base64.") 
        except Exception as e:
            print(f"Failed to load personal model: {e}")

# --------------------------------------------------------------------------
# EXAMPLE USAGE
# --------------------------------------------------------------------------
if __name__ == "__main__":
    # Mock training check
    pass