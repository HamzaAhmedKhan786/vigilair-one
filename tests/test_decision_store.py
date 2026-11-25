from pathlib import Path

from backend.decision_store import DecisionStore
from backend.replay import load_scenario
from backend.schemas import OperatorDecision


def test_history_survives_reopening_and_remains_scoped_to_incident(tmp_path):
    path = tmp_path / "decisions.db"
    first = load_scenario(Path("data/scenario.json"))[0]
    decision = OperatorDecision(action="preserve_evidence", decision="accepted")
    DecisionStore(path).add(first, decision)
    reopened = DecisionStore(path)
    assert reopened.history(first) == [decision]
    assert reopened.history(first.model_copy(update={"site_id": "other-site"})) == []
