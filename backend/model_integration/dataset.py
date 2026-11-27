"""Read the organizer's immutable Challenge 05 manifests without test-label access."""

import json
import re
import wave
from collections import Counter
from pathlib import Path

SPLITS = ("train", "valid", "test")
SOUND_CLASSES = ("drone_buzz", "vehicle_mechanical", "explosion", "ambient_outdoor")
EXPECTED_COUNTS = {"train": 276, "valid": 56, "test": 54}
CLIP_ID = re.compile(r"c5_[0-9]{4}\Z")


class DatasetError(ValueError):
    """The organizer manifest does not match the expected safe file contract."""


class Challenge05Dataset:
    def __init__(self, root: Path):
        self.root = Path(root).resolve()
        if not (self.root / "dataset" / "dataset_card.json").is_file():
            raise DatasetError("Challenge 05 dataset_card.json was not found")

    def rows(self, split: str) -> list[dict]:
        if split not in SPLITS:
            raise DatasetError("Split must be train, valid, or test")
        manifest = self.root / "dataset" / split / "labels.jsonl"
        if not manifest.is_file():
            raise DatasetError(f"Missing {split} manifest")
        rows = []
        seen = set()
        for line_no, line in enumerate(manifest.read_text(encoding="utf-8").splitlines(), 1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as exc:
                raise DatasetError(f"Invalid JSON on {split} line {line_no}") from exc
            clip_id = row.get("id")
            if not isinstance(clip_id, str) or not CLIP_ID.fullmatch(clip_id) or clip_id in seen:
                raise DatasetError(f"Invalid or duplicate clip ID on {split} line {line_no}")
            seen.add(clip_id)
            if row.get("split") != split:
                raise DatasetError(f"Split mismatch for {clip_id}")
            for kind, suffix in (("audio", ".wav"), ("spectrogram", ".png")):
                self.media_path(row, kind, split, suffix)
            if row.get("video") is not None:
                if split == "test":
                    raise DatasetError("Test rows must not include paired video")
                self.media_path(row, "video", split, ".mp4")
            if split == "test":
                if "sound_class" in row or "has_drone_audio" in row:
                    raise DatasetError("Held-out test labels must not be present")
            elif row.get("sound_class") not in SOUND_CLASSES or not isinstance(row.get("has_drone_audio"), bool):
                raise DatasetError(f"Invalid public labels for {clip_id}")
            rows.append(row)
        return rows

    def media_path(self, row: dict, kind: str, split: str, suffix: str) -> Path:
        value = row.get(kind)
        expected = Path(kind if kind != "spectrogram" else "spectrograms") / split / f"{row['id']}{suffix}"
        if not isinstance(value, str) or Path(value).as_posix() != expected.as_posix():
            raise DatasetError(f"Invalid {kind} path for {row['id']}")
        path = (self.root / expected).resolve()
        if not path.is_relative_to(self.root) or not path.is_file():
            raise DatasetError(f"Missing {kind} for {row['id']}")
        return path

    def clip(self, split: str, clip_id: str) -> dict:
        if not CLIP_ID.fullmatch(clip_id):
            raise DatasetError("Invalid clip ID")
        for row in self.rows(split):
            if row["id"] == clip_id:
                return row
        raise DatasetError("Clip not found in split")

    def audit(self, *, inspect_media: bool = False) -> dict:
        report = {"source": "organizer", "splits": {}, "total": 0}
        all_ids = set()
        for split in SPLITS:
            rows = self.rows(split)
            if len(rows) != EXPECTED_COUNTS[split]:
                raise DatasetError(f"Unexpected {split} count: {len(rows)}")
            ids = {row["id"] for row in rows}
            if all_ids & ids:
                raise DatasetError("Clip IDs overlap across splits")
            all_ids.update(ids)
            if inspect_media:
                from PIL import Image
                for row in rows:
                    with wave.open(str(self.media_path(row, "audio", split, ".wav")), "rb") as wav:
                        if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate(), wav.getnframes()) != (1, 2, 16000, 80000):
                            raise DatasetError(f"Unexpected WAV format for {row['id']}")
                    with Image.open(self.media_path(row, "spectrogram", split, ".png")) as image:
                        if image.format != "PNG" or image.size != (224, 224):
                            raise DatasetError(f"Unexpected spectrogram format for {row['id']}")
            report["splits"][split] = {
                "samples": len(rows),
                "paired_video": sum(row.get("video") is not None for row in rows),
                "labels_available": split != "test",
                "classes": dict(Counter(row["sound_class"] for row in rows)) if split != "test" else None,
            }
            report["total"] += len(rows)
        return report
