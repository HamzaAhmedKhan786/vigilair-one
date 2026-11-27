"""Audit the organizer pack or run a trusted acoustic ONNX model offline.

Examples are in docs/CHALLENGE05_INTEGRATION.md. This CLI does not train a model.
"""

import argparse
import json
from pathlib import Path

from backend.model_integration import Challenge05Dataset, RFDETRNanoModel, acoustic_model_from_path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    audit = sub.add_parser("audit", help="Validate organizer manifests and media")
    audit.add_argument("--dataset-dir", type=Path, required=True)
    audit.add_argument("--inspect-media", action="store_true")
    infer = sub.add_parser("infer", help="Predict one organizer-compatible spectrogram PNG")
    infer.add_argument("--model", type=Path, required=True)
    infer.add_argument("--png", type=Path, required=True)
    infer.add_argument("--sha256")
    infer.add_argument("--wake-threshold", type=float)
    infer.add_argument("--architecture", choices=("mobilenet_v3_small", "resnet18"), default="mobilenet_v3_small")
    batch = sub.add_parser("batch", help="Generate official submission JSONL and detailed outputs")
    batch.add_argument("--dataset-dir", type=Path, required=True)
    batch.add_argument("--model", type=Path, required=True)
    batch.add_argument("--split", choices=("train", "valid", "test"), default="valid")
    batch.add_argument("--out", type=Path, required=True)
    batch.add_argument("--details", type=Path)
    batch.add_argument("--sha256")
    batch.add_argument("--wake-threshold", type=float)
    batch.add_argument("--architecture", choices=("mobilenet_v3_small", "resnet18"), default="mobilenet_v3_small")
    visual = sub.add_parser("visual-infer", help="Run a full RF-DETR Nano ONNX export on one frame")
    visual.add_argument("--model", type=Path, required=True)
    visual.add_argument("--image", type=Path, required=True)
    visual.add_argument("--class-name", action="append", required=True,
                        help="Repeat in exactly the trained class order")
    visual.add_argument("--sha256")
    visual.add_argument("--confidence", type=float, default=0.25)
    args = parser.parse_args()

    if args.command == "audit":
        print(json.dumps(Challenge05Dataset(args.dataset_dir).audit(inspect_media=args.inspect_media), indent=2))
        return
    if args.command == "visual-infer":
        model = RFDETRNanoModel(args.model, tuple(args.class_name), expected_sha256=args.sha256)
        print(json.dumps(model.predict_image(args.image.read_bytes(), confidence=args.confidence,
                                           source="local_frame"), indent=2))
        return
    model = acoustic_model_from_path(args.model, wake_threshold=args.wake_threshold,
                                     architecture=args.architecture, expected_sha256=args.sha256)
    if args.command == "infer":
        print(json.dumps(model.predict_png(args.png.read_bytes(), source="local_spectrogram"), indent=2))
        return
    dataset = Challenge05Dataset(args.dataset_dir)
    official, details = [], []
    for row in dataset.rows(args.split):
        png = dataset.media_path(row, "spectrogram", args.split, ".png").read_bytes()
        result = model.predict_png(png, source="organizer_prerecorded")
        official.append({"id": row["id"], "wake_triggered": result["wake_triggered"],
                         "sound_class": result["sound_class"]})
        details.append({"id": row["id"], "split": args.split, **result})
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text("".join(json.dumps(row) + "\n" for row in official), encoding="utf-8")
    if args.details:
        args.details.parent.mkdir(parents=True, exist_ok=True)
        args.details.write_text("".join(json.dumps(row) + "\n" for row in details), encoding="utf-8")
    print(json.dumps({"split": args.split, "samples": len(official),
                      "submission": str(args.out),
                      "details": str(args.details) if args.details else None,
                      "model_sha256": model.status()["sha256"]}, indent=2))


if __name__ == "__main__":
    main()
