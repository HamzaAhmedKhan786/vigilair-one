"""Offline inference, replay validation, and detector evaluation."""

import argparse
from collections import Counter
import hashlib
import hmac
import json
import math
from pathlib import Path
import re
import time


def local_file(value, extensions):
    path = Path(value).resolve(strict=True)
    if not path.is_file() or path.suffix.lower() not in extensions:
        raise ValueError(f"Expected a local file with one of {sorted(extensions)}")
    return path


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def validate(bundle):
    if not isinstance(bundle, dict):
        raise ValueError("Replay bundle must be a JSON object")
    if bundle.get("version") != 1 or bundle.get("source") not in {"yolo", "snn", "manual"}:
        raise ValueError("Expected a version 1 replay with yolo, snn, or manual provenance")
    if not re.fullmatch(r"[0-9a-f]{64}", bundle.get("video_sha256", "")):
        raise ValueError("Invalid video SHA-256")
    if bundle["source"] != "manual" and not re.fullmatch(r"[0-9a-f]{64}", bundle.get("weights_sha256", "")):
        raise ValueError("Invalid model weights SHA-256")
    if bundle["source"] == "snn" and bundle.get("input_kind") not in {"recorded_events", "simulated_events"}:
        raise ValueError("SNN results must identify their event input source")
    width, height, fps = (bundle[key] for key in ("width", "height", "fps"))
    if any(type(value) is not int or value <= 0 for value in (width, height)):
        raise ValueError("Invalid frame dimensions")
    if not math.isfinite(fps) or fps <= 0 or not isinstance(bundle["frames"], list) or not bundle["frames"]:
        raise ValueError("Expected positive FPS and at least one frame")
    previous = -1
    for frame in bundle["frames"]:
        index = frame["index"]
        if type(index) is not int or index <= previous:
            raise ValueError("Frame indexes must be nonnegative and strictly increasing")
        previous = index
        if not math.isclose(frame["offset_s"], index / fps, rel_tol=0, abs_tol=1e-6):
            raise ValueError(f"Timestamp does not match frame {index}")
        for box in frame["boxes"]:
            if not isinstance(box["label"], str) or not box["label"].strip():
                raise ValueError(f"Missing label in frame {index}")
            left, top, right, bottom = box["xyxy"]
            if not (0 <= left < right <= width and 0 <= top < bottom <= height):
                raise ValueError(f"Invalid box in frame {index}")
            if bundle["source"] != "manual" and not 0 <= box["confidence"] <= 1:
                raise ValueError(f"Invalid detection confidence in frame {index}")
    return bundle


def load_bundle(path):
    path = local_file(path, {".json"})
    if path.stat().st_size > 64 * 1024 * 1024:
        raise ValueError("Replay bundle exceeds 64 MiB")
    return validate(json.loads(path.read_text(encoding="utf-8")))


def run_yolo(args):
    video = local_file(args.video, {".mp4", ".mov", ".avi", ".mkv"})
    weights = local_file(args.weights, {".pt"})
    checksum = digest(weights)
    if not hmac.compare_digest(checksum, args.weights_sha256.lower()):
        raise ValueError("Weight checksum mismatch; model was not loaded")
    if not 1 <= args.max_frames <= 10_000 or not 0 < args.confidence <= 1:
        raise ValueError("Expected 1–10000 frames and confidence in (0, 1]")
    output = Path(args.output).resolve()
    if output.suffix.lower() != ".json" or output.exists():
        raise ValueError("Output must be a new JSON file")

    import cv2
    import ultralytics
    from backend.detector import Detector

    detector = Detector(str(weights), device=args.device, confidence=args.confidence)
    detector.load()
    names = detector.class_names
    labels = {label.casefold() for label in args.require_class}
    if not labels.issubset({name.casefold() for name in names.values()}):
        raise ValueError("Required labels are missing from these weights")
    capture = cv2.VideoCapture(str(video))
    if not capture.isOpened():
        capture.release()
        raise ValueError("Cannot open the video")
    frames = []
    latencies = []
    try:
        fps = capture.get(cv2.CAP_PROP_FPS)
        if not math.isfinite(fps) or fps <= 0:
            raise ValueError("Video has no usable FPS")
        for index in range(args.max_frames):
            ok, frame = capture.read()
            if not ok:
                break
            height, width = frame.shape[:2]
            if index and (width, height) != (bundle_width, bundle_height):
                raise ValueError("Frame dimensions changed during replay")
            bundle_width, bundle_height = width, height
            if width * height > 3840 * 2160:
                raise ValueError("Frame resolution exceeds the offline runner limit")
            started = time.perf_counter()
            detections = detector.detect(frame)
            latencies.append((time.perf_counter() - started) * 1000)
            boxes = [
                {"label": names[item["class_id"]], "confidence": item["confidence"], "xyxy": item["bbox_xyxy"]}
                for item in detections
            ]
            frames.append({"index": index, "offset_s": index / fps, "boxes": boxes})
    finally:
        capture.release()
    if not frames:
        raise ValueError("Video contains no decodable frames")
    ordered = sorted(latencies)
    bundle = validate({
        "version": 1, "source": "yolo", "video_sha256": digest(video),
        "weights_sha256": checksum, "runtime_version": ultralytics.__version__,
        "device": args.device, "confidence_threshold": args.confidence,
        "width": bundle_width, "height": bundle_height, "fps": fps, "frames": frames,
        "predict_ms": {"mean": sum(latencies) / len(latencies), "p95": ordered[math.ceil(.95 * len(ordered)) - 1]},
    })
    encoded = json.dumps(bundle, allow_nan=False)
    with output.open("x", encoding="utf-8") as stream:
        stream.write(encoded)


def iou(a, b):
    overlap = max(0, min(a[2], b[2]) - max(a[0], b[0])) * max(0, min(a[3], b[3]) - max(a[1], b[1]))
    area_a = (a[2] - a[0]) * (a[3] - a[1])
    area_b = (b[2] - b[0]) * (b[3] - b[1])
    return overlap / (area_a + area_b - overlap)


def evaluate(prediction, truth):
    if prediction["source"] not in {"yolo", "snn"} or truth["source"] != "manual":
        raise ValueError("Expected model predictions and manual reference annotations")
    if any(prediction[key] != truth[key] for key in ("video_sha256", "width", "height", "fps")):
        raise ValueError("Replay video metadata does not match")
    preds = {frame["index"]: frame["boxes"] for frame in prediction["frames"]}
    reference = {frame["index"]: frame["boxes"] for frame in truth["frames"]}
    if preds.keys() != reference.keys():
        raise ValueError("Both inputs must cover the same frames, including empty frames")
    counts = Counter()
    for index, boxes in preds.items():
        remaining = list(reference[index])
        for box in sorted(boxes, key=lambda item: item["confidence"], reverse=True):
            matches = [
                (iou(box["xyxy"], item["xyxy"]), idx)
                for idx, item in enumerate(remaining) if box["label"].casefold() == item["label"].casefold()
            ]
            score, match = max(matches, default=(0, None))
            if score >= .5:
                remaining.pop(match)
                counts["tp"] += 1
            else:
                counts["fp"] += 1
        counts["fn"] += len(remaining)
    tp, fp, fn = (counts[key] for key in ("tp", "fp", "fn"))
    return {
        "source": prediction["source"], "input_kind": prediction.get("input_kind"),
        "frames": len(preds), "iou_threshold": .5, "tp": tp, "fp": fp, "fn": fn,
        "precision": tp / (tp + fp) if tp + fp else None,
        "recall": tp / (tp + fn) if tp + fn else None,
        "predict_ms": prediction.get("predict_ms"),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    run = commands.add_parser("yolo")
    run.add_argument("video")
    run.add_argument("weights", help="Trusted local .pt checkpoint")
    run.add_argument("output")
    run.add_argument("--weights-sha256", required=True, help="Digest from a trusted source")
    run.add_argument("--require-class", action="append", required=True)
    run.add_argument("--device", default="cpu")
    run.add_argument("--confidence", type=float, default=.35)
    run.add_argument("--max-frames", type=int, default=300)
    check = commands.add_parser("validate")
    check.add_argument("bundle")
    check.add_argument("--video", required=True)
    score = commands.add_parser("evaluate")
    score.add_argument("prediction")
    score.add_argument("truth")
    args = parser.parse_args()
    try:
        if args.command == "yolo":
            run_yolo(args)
        elif args.command == "validate":
            bundle = load_bundle(args.bundle)
            if digest(local_file(args.video, {".mp4", ".mov", ".avi", ".mkv"})) != bundle["video_sha256"]:
                raise ValueError("Video checksum mismatch")
            print(f"Validated {len(bundle['frames'])} {bundle['source']} frames")
        else:
            print(json.dumps(evaluate(load_bundle(args.prediction), load_bundle(args.truth)), indent=2))
    except (OSError, ValueError, TypeError, KeyError, ImportError, RuntimeError) as exc:
        parser.exit(1, f"Replay failed: {exc}\n")


if __name__ == "__main__":
    main()
