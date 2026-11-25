"""Optional XGBoost risk classifier.

Use only after enough labeled operator outcomes exist. The deterministic risk
engine remains the default and every ML output must retain feature attribution.
Models are saved in XGBoost JSON format, never Python pickle.
"""
from pathlib import Path

FEATURE_NAMES = ["detector_confidence","dwell_seconds","speed_mps","turn_rate_deg_s","zone_distance_m","audio_confidence","radar_confidence","sensor_count"]

def train_xgboost(rows: list[dict], model_path: Path) -> dict:
    import numpy as np
    import xgboost as xgb
    if len(rows) < 50: raise ValueError("at least 50 labeled rows are required; synthetic demo rows are not sufficient for deployment")
    x = np.asarray([[float(row.get(name, 0)) for name in FEATURE_NAMES] for row in rows], dtype=np.float32)
    y = np.asarray([int(row["risk_label"]) for row in rows], dtype=np.int32)
    model = xgb.XGBClassifier(n_estimators=150,max_depth=4,learning_rate=.05,subsample=.8,colsample_bytree=.8,eval_metric="logloss")
    model.fit(x,y); model_path.parent.mkdir(parents=True,exist_ok=True); model.save_model(model_path)
    return {"rows":len(rows),"features":FEATURE_NAMES,"model_path":str(model_path)}

def predict_xgboost(features: dict, model_path: Path) -> dict:
    import numpy as np
    import xgboost as xgb
    model = xgb.XGBClassifier(); model.load_model(model_path)
    x = np.asarray([[float(features.get(name,0)) for name in FEATURE_NAMES]],dtype=np.float32)
    probability = float(model.predict_proba(x)[0,1])
    booster = model.get_booster(); contributions = booster.predict(xgb.DMatrix(x,feature_names=FEATURE_NAMES),pred_contribs=True)[0]
    return {"probability":round(probability,4),"feature_contributions":dict(zip(FEATURE_NAMES,[round(float(v),4) for v in contributions[:-1]])),"human_review_required":True}
