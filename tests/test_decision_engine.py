from pathlib import Path
from backend.decision_engine import decision_packet
from backend.geometry import analyze_track
from backend.replay import load_scenario
from backend.risk_engine import assess_risk

def test_decision_packet_keeps_human_gate_and_prohibitions():
    observations=[o for o in load_scenario(Path("data/scenario.json")) if o.track_id=="VIG-042"]
    packet=decision_packet(assess_risk(observations,(650,250,900,450)),analyze_track(observations,(120,60,180,120)))
    assert packet["operator_gate"]["required"] is True
    assert "jamming" in packet["prohibited_actions"]
