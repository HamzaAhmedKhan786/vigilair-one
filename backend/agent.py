"""Bounded operator-assistance agent.

The agent can summarize evidence and propose workflow actions. It cannot
change scores, call external responders, or access physical-control APIs.
"""
from .schemas import RiskAssessment

def build_operator_brief(risk: RiskAssessment) -> dict:
    action_text = ", ".join(action.value.replace("_", " ") for action in risk.recommended_actions)
    return {
        "summary": f"Track {risk.track_id} is {risk.level} risk at {risk.score}/100.",
        "why": risk.reasons,
        "suggested_workflow": action_text,
        "disclaimer": "Human approval required. No physical control or autonomous interception is available.",
    }
