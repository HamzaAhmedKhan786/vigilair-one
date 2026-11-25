"""Compare site-frame forecasts with later observations in a replay scenario."""
import argparse
from collections import defaultdict
import json
import math
from pathlib import Path

from backend.geometry import analyze_track
from backend.replay import load_scenario


def evaluate(observations, horizon, tolerance):
    grouped = defaultdict(list)
    for item in observations:
        if item.site_position_m is not None:
            grouped[item.site_id, item.track_id].append(item)
    errors = []
    for track in grouped.values():
        track.sort(key=lambda item: item.timestamp)
        for index in range(1, len(track) - 1):
            previous, anchor = track[index - 1:index + 1]
            if previous.timestamp == anchor.timestamp:
                continue
            for target in track[index + 1:]:
                elapsed = (target.timestamp - anchor.timestamp).total_seconds()
                if elapsed > horizon + tolerance:
                    break
                if elapsed > 0 and abs(elapsed - horizon) <= tolerance:
                    # Compare at the observation's actual offset to avoid timing mismatch.
                    model = analyze_track([previous, anchor], None)
                    direction = math.radians(model.heading_deg)
                    x, y = anchor.site_position_m[:2]
                    displacement = elapsed * model.current_speed_mps
                    errors.append(math.hypot(
                        x + math.sin(direction) * displacement - target.site_position_m[0],
                        y + math.cos(direction) * displacement - target.site_position_m[1],
                    ))
                    break
    errors.sort()
    return {
        "horizon_seconds": horizon,
        "matching_tolerance_seconds": tolerance,
        "sample_count": len(errors),
        "mean_horizontal_error_m": sum(errors) / len(errors) if errors else None,
        "p95_horizontal_error_m": errors[math.ceil(.95 * len(errors)) - 1] if errors else None,
        "sources": sorted({item.source for item in observations}),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scenario", type=Path)
    parser.add_argument("--horizon", type=float, default=10)
    parser.add_argument("--tolerance", type=float, default=1)
    args = parser.parse_args()
    if not 0 < args.horizon <= 30 or not 0 <= args.tolerance < args.horizon:
        parser.error("Use a positive horizon up to 30 seconds and a smaller nonnegative tolerance.")
    print(json.dumps(evaluate(load_scenario(args.scenario), args.horizon, args.tolerance), indent=2))
