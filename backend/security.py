"""Small security helpers for the demo gateway."""
import hashlib
import hmac
import json
from datetime import datetime, timezone

def canonical_json(value: dict) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()

def sign_manifest(manifest: dict, secret: str) -> str:
    return hmac.new(secret.encode(), canonical_json(manifest), hashlib.sha256).hexdigest()

def audit_event(event: str, actor: str, target: str, details: dict | None = None) -> dict:
    return {"timestamp": datetime.now(timezone.utc).isoformat(), "event": event, "actor": actor, "target": target, "details": details or {}}
