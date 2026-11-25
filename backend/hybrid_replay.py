"""Experimental, offline vision and spiking activity evaluation."""
import argparse
from collections import Counter
import json
import math
from pathlib import Path
from time import perf_counter
from typing import Annotated, Literal

from pydantic import BaseModel, Field, model_validator

FIXTURE = Path(__file__).resolve().parents[1] / "testsampledata" / "hybrid_replay.json"
TAU_MS = 18.0
SPIKE_THRESHOLD = 2.8
REFRACTORY_MS = 6.0
MIN_SPIKES = 2
VISION_THRESHOLD = 0.60
EventTime = Annotated[float, Field(ge=0, le=1000, allow_inf_nan=False)]


class Window(BaseModel):
    window_id: str
    vision_label: str | None = None
    vision_confidence: float | None = Field(default=None, ge=0, le=1)
    event_times_ms: list[EventTime] = Field(max_length=5000)
    expected_activity: bool | None = None

    @model_validator(mode="after")
    def validate_window(self):
        if (self.vision_label is None) != (self.vision_confidence is None):
            raise ValueError("Provide both vision label and confidence, or neither")
        if any(a > b for a, b in zip(self.event_times_ms, self.event_times_ms[1:])):
            raise ValueError("Event timestamps must be in chronological order")
        return self


class Replay(BaseModel):
    event_input: Literal["simulated_events", "recorded_events"]
    vision_input: Literal["synthetic_labels", "yolo_predictions", "manual_labels"]
    windows: list[Window] = Field(min_length=1, max_length=500)


def spike_times(events: list[float]) -> list[float]:
    """Simulate one leaky integrate-and-fire neuron with a refractory period."""
    potential = 0.0
    previous = 0.0
    refractory_until = 0.0
    spikes = []
    for timestamp in events:
        potential *= math.exp(-(timestamp - previous) / TAU_MS)
        previous = timestamp
        if timestamp < refractory_until:
            continue
        potential += 1.0
        if potential >= SPIKE_THRESHOLD:
            spikes.append(timestamp)
            potential = 0.0
            refractory_until = timestamp + REFRACTORY_MS
    return spikes


def evaluate(replay: Replay) -> dict:
    counts = Counter()
    results = []
    elapsed_ms = 0.0
    for window in replay.windows:
        started = perf_counter()
        spikes = spike_times(window.event_times_ms)
        elapsed_ms += (perf_counter() - started) * 1000
        activity = len(spikes) >= MIN_SPIKES
        has_vision = window.vision_confidence is not None and window.vision_confidence >= VISION_THRESHOLD
        if window.expected_activity is not None:
            counts["correct"] += int(window.expected_activity == activity)
            counts["labeled"] += 1
        if activity and has_vision:
            outcome = "vision_with_temporal_support"
        elif has_vision:
            outcome = "vision_only"
        elif activity:
            outcome = "activity_only"
        else:
            outcome = "insufficient_evidence"
        results.append({
            "window_id": window.window_id,
            "vision_label": window.vision_label,
            "vision_confidence": window.vision_confidence,
            "event_count": len(window.event_times_ms),
            "spike_times_ms": spikes,
            "activity": activity,
            "expected_activity": window.expected_activity,
            "outcome": outcome,
        })
    return {
        "experimental": True,
        "event_input": replay.event_input,
        "vision_input": replay.vision_input,
        "window_count": len(results),
        "labeled_windows": counts["labeled"],
        "activity_accuracy": counts["correct"] / counts["labeled"] if counts["labeled"] else None,
        "snn_compute_ms_per_window": elapsed_ms / len(results),
        "windows": results,
    }


def load_replay(path: Path) -> Replay:
    if path.stat().st_size > 4 * 1024 * 1024:
        raise ValueError("Hybrid replay must be 4 MiB or smaller")
    return Replay.model_validate_json(path.read_bytes())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bundle", type=Path, nargs="?", default=FIXTURE)
    args = parser.parse_args()
    try:
        print(json.dumps(evaluate(load_replay(args.bundle)), indent=2))
    except (OSError, ValueError) as exc:
        parser.exit(1, f"Hybrid replay failed: {exc}\n")
