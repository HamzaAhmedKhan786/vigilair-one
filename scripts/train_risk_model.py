import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.ml_risk import train_xgboost
input_path = ROOT / "testsampledata" / "risk_training_template.csv"
rows = list(csv.DictReader(input_path.open(encoding="utf-8")))
print(train_xgboost(rows, ROOT / "models" / "risk_xgboost.json"))
