# File: features/tilt_detector/train_model_sdk.py
import pandas as pd
import numpy as np
import xgboost as xgb
import joblib
import json
import os
import pytz
from pathlib import Path
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.metrics import roc_auc_score

# --- DEFAULT PATHS ---
BASE_DIR = Path(__file__).resolve().parents[2]
DEFAULT_RAW_JSON = BASE_DIR / "data/eval_formatted/julio_amigo_dos_games_full_wiht_eval.json"
DEFAULT_MODEL = BASE_DIR / "assets/tilt_model.json"
DEFAULT_CONFIG = BASE_DIR / "assets/tilt_config.joblib"
DEFAULT_SUMMARY = BASE_DIR / "output_analysis/tilt_detector/training_summary.txt"

# Constants for Feature Engineering
HERO_USER = "julio_amigo_dos"
SESSION_GAP_MINUTES = 30
LOCAL_TZ = 'Europe/Warsaw'

class TiltModel:
    def __init__(self, local_tz=LOCAL_TZ):
        self.local_tz = local_tz
        self.model = None
        self.config = {}
        
        # Features used by the model
        self.feature_cols = [
            'my_acpl', 'my_blunder_count', 'my_avg_secs_per_move', 'result',
            'games_played', 'speed_vs_start', 'session_pl', 'loss_streak',
            'roll_5_acpl_mean', 'roll_5_time_per_move',
            'log_break_time',
            'tod_morning', 'tod_midday', 'tod_evening', 'tod_night'
        ]
        
        # Stabilized Hyperparameters
        self.params = {
            'objective': 'binary:logistic',
            'eval_metric': 'auc',
            'max_depth': 3,
            'learning_rate': 0.05,
            'subsample': 0.8,
            'colsample_bytree': 0.8,
            'n_estimators': 150,
            'gamma': 1.0,
            'min_child_weight': 5,
            'scale_pos_weight': 5,
            'n_jobs': -1,
            'random_state': 42
        }

    # ------------------------------------------------------------------
    # 1. DATA PREPARATION (Raw JSON -> Training DF)
    # ------------------------------------------------------------------
    def _assign_time_of_day(self, hour):
        if 5 <= hour < 9: return 'morning'
        elif 9 <= hour < 18: return 'midday'
        elif 18 <= hour < 23: return 'evening'
        else: return 'night'

    def process_raw_data(self, json_path):
        """
        Full ETL Pipeline: Loads Raw JSON, cleans, engineers features, and labels target.
        Returns a DataFrame ready for training.
        """
        print(f"--- Processing Raw Data from {json_path} ---")
        if not os.path.exists(json_path):
            raise FileNotFoundError(f"{json_path} not found.")
            
        with open(json_path, 'r') as f:
            data = json.load(f)
        
        # Flatten
        df = pd.json_normalize(data, sep='_')
        print(f"Loaded {len(df)} raw games.")

        # --- A. Basic Extraction ---
        # 1. User Color & Ratings
        df['user_color'] = np.where(df['players_white_user_name'] == HERO_USER, 'white', 'black')
        
        # 2. ACPL / Blunders
        df['my_acpl'] = np.where(df['user_color'] == 'white', 
                                 df.get('players_white_analysis_acpl', np.nan), 
                                 df.get('players_black_analysis_acpl', np.nan))
        df['my_blunder_count'] = np.where(df['user_color'] == 'white', 
                                          df.get('players_white_analysis_blunder', np.nan), 
                                          df.get('players_black_analysis_blunder', np.nan))
        
        # 3. P/L (Rating Diff)
        w_diff = df.get('players_white_ratingDiff', 0).fillna(0)
        b_diff = df.get('players_black_ratingDiff', 0).fillna(0)
        df['rating_diff'] = np.where(df['user_color'] == 'white', w_diff, b_diff)
        
        # 4. Result
        conditions = [ df['winner'] == df['user_color'], df['winner'].isna() ]
        choices = [1.0, 0.5]
        df['result'] = np.select(conditions, choices, default=0.0)
        
        # 5. Time Calculation
        df['created_at'] = pd.to_datetime(df['createdAt'], unit='ms', utc=True)
        df['last_move_at'] = pd.to_datetime(df['lastMoveAt'], unit='ms', utc=True)
        df['game_duration_sec'] = (df['last_move_at'] - df['created_at']).dt.total_seconds()
        
        # Count moves
        df['moves_list'] = df['moves'].fillna("").apply(lambda x: x.split(" "))
        df['move_count'] = df['moves_list'].apply(lambda x: len(x) // 2)
        df['my_avg_secs_per_move'] = df['game_duration_sec'] / df['move_count'].replace(0, 1)

        # --- B. Session & Advanced Features ---
        df = df.sort_values('created_at').reset_index(drop=True)
        
        # 1. Session ID
        df['time_diff'] = df['created_at'].diff()
        df['is_new_session'] = (df['time_diff'] > pd.Timedelta(minutes=SESSION_GAP_MINUTES)) | (df['time_diff'].isna())
        df['session_id'] = df['is_new_session'].cumsum()
        
        grp = df.groupby('session_id')
        
        # 2. Games Played & Session P/L
        df['games_played'] = grp.cumcount() + 1
        df['session_pl'] = grp['rating_diff'].cumsum()
        df['session_cum_pl'] = df['session_pl']
        
        # 3. Speed vs Start
        first_speed = grp['my_avg_secs_per_move'].transform('first')
        df['speed_vs_start'] = df['my_avg_secs_per_move'] / (first_speed + 0.001)
        
        # 4. Loss Streak
        df['is_loss'] = (df['result'] == 0.0).astype(int)
        streak_group = (df['is_loss'] == 0).cumsum()
        df['loss_streak'] = df.groupby(streak_group).cumcount()
        df.loc[df['is_loss'] == 0, 'loss_streak'] = 0
        
        # 5. Rolling Features
        acpl_safe = df['my_acpl'].fillna(0)
        df['roll_5_acpl_mean'] = grp['my_acpl'].transform(lambda x: acpl_safe.rolling(5).mean())
        df['roll_5_time_per_move'] = grp['my_avg_secs_per_move'].transform(lambda x: x.rolling(5).mean())
        df[['roll_5_acpl_mean', 'roll_5_time_per_move']] = df[['roll_5_acpl_mean', 'roll_5_time_per_move']].fillna(0)

        # --- C. Time Features ---
        # 1. Break Time (Log)
        df['prev_game_end'] = grp['last_move_at'].shift(1)
        df['break_time'] = (df['created_at'] - df['prev_game_end']).dt.total_seconds()
        df['break_time'] = df['break_time'].fillna(0.0).clip(lower=0)
        df['log_break_time'] = np.log1p(df['break_time'])
        
        # 2. Time of Day (One-Hot)
        try:
            tz = pytz.timezone(self.local_tz)
            local_time = df['created_at'].dt.tz_convert(tz)
        except:
            local_time = df['created_at']
            
        df['time_of_day_label'] = local_time.dt.hour.apply(self._assign_time_of_day)
        
        tod_dummies = pd.get_dummies(df['time_of_day_label'], prefix='tod', dtype=int)
        for tod in ['morning', 'midday', 'evening', 'night']:
            col_name = f'tod_{tod}'
            if col_name not in tod_dummies.columns:
                tod_dummies[col_name] = 0
        df = pd.concat([df, tod_dummies], axis=1)

        # --- D. Cleaning & Target ---
        # Drop missing analysis
        df_clean = df.dropna(subset=['my_acpl', 'my_blunder_count']).copy()
        
        # Calculate Target (Ideal Stop)
        session_max = df_clean.groupby('session_id')['session_cum_pl'].transform('max')
        df_clean['is_max'] = (df_clean['session_cum_pl'] == session_max)
        
        target_indices = df_clean[df_clean['is_max']].groupby('session_id')['games_played'].idxmin()
        
        df_clean['target'] = 0
        df_clean.loc[target_indices, 'target'] = 1
        
        print(f"Data Processed. {len(df_clean)} rows ready for training.")
        return df_clean

    # ------------------------------------------------------------------
    # 2. INFERENCE HELPERS (Raw List -> DataFrame)
    # ------------------------------------------------------------------
    def _enrich_json(self, games_list):
        """
        Lightweight version of process_raw_data for real-time inference.
        Assumes input is list of dicts with basic fields.
        """
        if not games_list: return pd.DataFrame()

        rows = []
        for g in games_list:
            created_at = pd.to_datetime(g.get('createdAt'), unit='ms', utc=True)
            last_move = pd.to_datetime(g.get('lastMoveAt'), unit='ms', utc=True)
            
            rows.append({
                'created_at': created_at,
                'last_move_at': last_move,
                'my_acpl': g.get('my_acpl', 50),
                'my_blunder_count': g.get('my_blunder_count', 0),
                'my_avg_secs_per_move': g.get('my_avg_secs_per_move', 5.0),
                'result': g.get('result', 0.5),
                'rating_diff': g.get('rating_diff', 0)
            })
            
        df = pd.DataFrame(rows)
        df = df.sort_values('created_at').reset_index(drop=True)
        
        # Session Context (Inference assumes single session context)
        df['games_played'] = df.index + 1
        df['session_pl'] = df['rating_diff'].cumsum()
        
        # Streak
        df['is_loss'] = (df['result'] == 0.0).astype(int)
        streak_group = (df['is_loss'] == 0).cumsum()
        df['loss_streak'] = df.groupby(streak_group).cumcount()
        df.loc[df['is_loss'] == 0, 'loss_streak'] = 0
        
        # Rolling
        df['roll_5_acpl_mean'] = df['my_acpl'].rolling(5, min_periods=1).mean().fillna(50)
        df['roll_5_time_per_move'] = df['my_avg_secs_per_move'].rolling(5, min_periods=1).mean().fillna(5)
        
        first_speed = df['my_avg_secs_per_move'].iloc[0] + 0.001
        df['speed_vs_start'] = df['my_avg_secs_per_move'] / first_speed
        
        # Time
        df['prev_game_end'] = df['last_move_at'].shift(1)
        df['break_time'] = (df['created_at'] - df['prev_game_end']).dt.total_seconds()
        df['break_time'] = df['break_time'].fillna(0).clip(lower=0)
        df['log_break_time'] = np.log1p(df['break_time'])
        
        try:
            tz = pytz.timezone(self.local_tz)
            local_time = df['created_at'].dt.tz_convert(tz)
        except:
            local_time = df['created_at']
            
        df['tod_label'] = local_time.dt.hour.apply(self._assign_time_of_day)
        for t in ['morning', 'midday', 'evening', 'night']:
            df[f'tod_{t}'] = (df['tod_label'] == t).astype(int)
            
        return df

    # ------------------------------------------------------------------
    # 3. TRAINING & OPTIMIZATION
    # ------------------------------------------------------------------
    def train(self, input_path=DEFAULT_RAW_JSON, save_path=DEFAULT_MODEL):
        """
        End-to-End: Preprocess -> Train -> Optimize -> Save
        """
        # A. Preprocess
        # Check file extension to decide mode
        if str(input_path).endswith('.json'):
            df = self.process_raw_data(input_path)
        else:
            print(f"Loading pre-processed CSV from {input_path}")
            df = pd.read_csv(input_path)

        # Validation
        missing = [c for c in self.feature_cols if c not in df.columns]
        if missing:
            raise ValueError(f"Missing features: {missing}")
            
        X = df[self.feature_cols]
        y = df['target']
        groups = df['session_id']
        
        print(f"Training on {len(df)} games...")
        
        # B. Train
        self.model = xgb.XGBClassifier(**self.params)
        self.model.fit(X, y)
        
        # C. Optimize
        print("Optimizing Threshold...")
        df['tilt_prob'] = self.model.predict_proba(X)[:, 1]
        best_thresh, best_pl, improvement = self._optimize_threshold(df)
        
        # D. Save
        self.config = {
            'features': self.feature_cols,
            'params': self.params,
            'threshold': best_thresh,
            'pl_improvement_est': improvement
        }
        self.save(save_path)
        self._save_summary(df, best_thresh, best_pl, improvement)
        
        print(f"✅ Training Complete.")
        print(f"   Best Threshold: {best_thresh:.2f}")
        print(f"   Est. Gain: {improvement:+.0f}")

    def _optimize_threshold(self, df):
        if 'rating_diff' not in df.columns: return 0.5, 0, 0
        
        thresholds = np.arange(0.30, 0.90, 0.02)
        baseline = df['rating_diff'].sum()
        best_pl = -float('inf')
        best_t = 0.5
        
        for t in thresholds:
            sim_pl = 0
            for _, grp in df.groupby('session_id'):
                stops = grp.index[grp['tilt_prob'] > t]
                if not stops.empty:
                    # Stop AFTER this game
                    idx = stops[0]
                    g_reset = grp.reset_index()
                    # Find local index of the global index 'idx'
                    # Safe approach: boolean mask
                    local_mask = g_reset['index'] == idx
                    if local_mask.any():
                        stop_loc = local_mask.idxmax()
                        played = g_reset.iloc[:stop_loc+1]
                        sim_pl += played['rating_diff'].sum()
                else:
                    sim_pl += grp['rating_diff'].sum()
            
            if sim_pl > best_pl:
                best_pl = sim_pl
                best_t = t
                
        return best_t, best_pl, (best_pl - baseline)

    def _save_summary(self, df, thresh, pl, improve):
        summary_path = Path(DEFAULT_SUMMARY)
        summary_path.parent.mkdir(parents=True, exist_ok=True)
        txt = f"TILT MODEL SUMMARY\nDate: {pd.Timestamp.now()}\nRows: {len(df)}\nThreshold: {thresh:.2f}\nProj P/L: {pl:.0f}\nGain: {improve:+.0f}"
        with open(summary_path, 'w') as f: f.write(txt)

    # ------------------------------------------------------------------
    # 4. PREDICTION & EXPLAINABILITY
    # ------------------------------------------------------------------
    def predict(self, session_history_json):
        if self.model is None: raise ValueError("Model not loaded.")
        df = self._enrich_json(session_history_json)
        if df.empty: return None
        
        last_row = df.iloc[[-1]]
        X = last_row[self.feature_cols]
        prob = self.model.predict_proba(X)[0, 1]
        thresh = self.config.get('threshold', 0.5)
        
        return {
            "stop_probability": float(prob),
            "threshold": float(thresh),
            "should_stop": bool(prob > thresh),
            "features": X.to_dict(orient='records')[0]
        }

    def explain_feature_importance(self, top_n=10):
        if self.model is None: return {}
        imp = self.model.get_booster().get_score(importance_type='weight')
        sorted_imp = sorted(imp.items(), key=lambda x: x[1], reverse=True)
        print(f"\n--- Top {top_n} Features ---")
        for k, v in sorted_imp[:top_n]:
            print(f"{k:<20}: {v}")
        return dict(sorted_imp[:top_n])

    # ------------------------------------------------------------------
    # 5. PERSISTENCE
    # ------------------------------------------------------------------
    def save(self, model_path):
        model_path = Path(model_path)
        model_path.parent.mkdir(parents=True, exist_ok=True)
        self.model.save_model(model_path)
        joblib.dump(self.config, model_path.parent / "tilt_config.joblib")

    def load(self, model_path=DEFAULT_MODEL):
        model_path = Path(model_path)
        if not model_path.exists(): raise FileNotFoundError(f"Model not found: {model_path}")
        self.model = xgb.XGBClassifier()
        self.model.load_model(model_path)
        config_path = model_path.parent / "tilt_config.joblib"
        if config_path.exists():
            self.config = joblib.load(config_path)
            self.feature_cols = self.config.get('features', self.feature_cols)

if __name__ == "__main__":
    # Example: Run pipeline on Raw JSON directly
    model = TiltModel()
    # model.train(DEFAULT_RAW_JSON) # Uncomment to run full pipeline
    # model.explain_feature_importance()