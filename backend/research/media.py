"""Local, immutable research media and independent human annotations."""

from __future__ import annotations

import hashlib
import io
import json
import sqlite3
import subprocess
import uuid
import wave
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from time import perf_counter

import numpy as np
from PIL import Image, UnidentifiedImageError

MEDIA_TYPES = {"wav": "audio/wav", "mp3": "audio/mpeg", "mp4": "video/mp4",
               "webm": "video/webm", "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png"}
MAX_MEDIA_BYTES = 100 * 1024 * 1024


class MediaError(ValueError):
    pass


def _probe(path: Path) -> dict:
    try:
        result = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                                 "format=duration:stream=codec_type,width,height,sample_rate,channels",
                                 "-of", "json", str(path)], capture_output=True, text=True,
                                timeout=5, check=True)
        value = json.loads(result.stdout)
        streams = value.get("streams", [])
        return {"duration_s": float(value.get("format", {}).get("duration")) if value.get("format", {}).get("duration") else None,
                "streams": [{key: stream[key] for key in ("codec_type", "width", "height", "sample_rate", "channels") if key in stream} for stream in streams]}
    except (FileNotFoundError, subprocess.SubprocessError, ValueError, json.JSONDecodeError):
        return {"duration_s": None, "streams": [], "probe_status": "unavailable"}


def validate_media(path: Path, extension: str) -> dict:
    data = path.read_bytes() if path.stat().st_size <= MAX_MEDIA_BYTES else b""
    if not data or len(data) > MAX_MEDIA_BYTES:
        raise MediaError("Media is empty or exceeds 100 MiB")
    if extension == "wav":
        try:
            with wave.open(io.BytesIO(data), "rb") as audio:
                if audio.getcomptype() != "NONE" or audio.getsampwidth() not in (1, 2, 4) or audio.getnchannels() not in (1, 2):
                    raise MediaError("Unsupported WAV encoding")
                return {"duration_s": round(audio.getnframes() / audio.getframerate(), 3),
                        "sample_rate_hz": audio.getframerate(), "channels": audio.getnchannels(),
                        "challenge05_compatible": (audio.getnframes(), audio.getframerate(), audio.getnchannels(), audio.getsampwidth()) == (80000, 16000, 1, 2)}
        except (wave.Error, ZeroDivisionError) as exc:
            raise MediaError("Invalid WAV file") from exc
    if extension == "mp3":
        if not (data.startswith(b"ID3") or (len(data) > 2 and data[0] == 0xff and data[1] & 0xe0 == 0xe0)):
            raise MediaError("Invalid MP3 signature")
        return _probe(path)
    if extension == "mp4":
        if len(data) < 12 or data[4:8] != b"ftyp":
            raise MediaError("Invalid MP4 container signature")
        return _probe(path)
    if extension == "webm":
        if not data.startswith(b"\x1a\x45\xdf\xa3"):
            raise MediaError("Invalid WebM container signature")
        return _probe(path)
    if extension in ("jpg", "jpeg", "png"):
        try:
            with Image.open(io.BytesIO(data)) as image:
                if image.width > 8192 or image.height > 8192 or image.width < 1 or image.height < 1:
                    raise MediaError("Image dimensions are out of range")
                if image.format != ("JPEG" if extension in ("jpg", "jpeg") else "PNG"):
                    raise MediaError("Image encoding does not match extension")
                image.verify()
                return {"width": image.width, "height": image.height,
                        "challenge05_compatible": extension == "png" and image.size == (224, 224)}
        except (UnidentifiedImageError, OSError) as exc:
            raise MediaError("Invalid image") from exc
    raise MediaError("Unsupported media extension")


class MediaStore:
    def __init__(self, database: Path, storage: Path):
        self.storage = storage
        self.storage.mkdir(parents=True, exist_ok=True)
        database.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(database, check_same_thread=False)
        self.connection.row_factory = sqlite3.Row
        self.lock = RLock()
        with self.connection:
            self.connection.execute("CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, site_id TEXT NOT NULL, sensor_id TEXT NOT NULL, original_name TEXT NOT NULL, extension TEXT NOT NULL, sha256 TEXT NOT NULL, bytes INTEGER NOT NULL, metadata_json TEXT NOT NULL, state TEXT NOT NULL, created_at TEXT NOT NULL)")
            self.connection.execute("CREATE TABLE IF NOT EXISTS annotations (id TEXT PRIMARY KEY, media_id TEXT NOT NULL, label TEXT NOT NULL, reviewer TEXT NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(media_id) REFERENCES media(id))")
            self.connection.execute("CREATE TABLE IF NOT EXISTS virtual_sensors (id TEXT PRIMARY KEY, site_id TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, created_at TEXT NOT NULL)")

    def seed_sensors(self, site_ids: list[str]) -> None:
        with self.lock, self.connection:
            for site_id in site_ids:
                for kind in ("microphone", "camera"):
                    sensor_id = f"{site_id}-{kind[:3].upper()}"
                    self.connection.execute("INSERT OR IGNORE INTO virtual_sensors VALUES (?,?,?,?,?)",
                                            (sensor_id, site_id, f"Virtual {kind}", kind, datetime.now(timezone.utc).isoformat()))

    def sensors(self) -> list[dict]:
        with self.lock:
            return [dict(row) for row in self.connection.execute("SELECT * FROM virtual_sensors ORDER BY site_id,id")]

    def add_sensor(self, site_id: str, name: str, kind: str) -> dict:
        if kind not in ("microphone", "camera") or not name.strip() or len(name) > 80:
            raise MediaError("Invalid virtual sensor")
        sensor = {"id": f"VS-{uuid.uuid4().hex[:10]}", "site_id": site_id, "name": name.strip(),
                  "kind": kind, "created_at": datetime.now(timezone.utc).isoformat()}
        with self.lock, self.connection:
            self.connection.execute("INSERT INTO virtual_sensors VALUES (:id,:site_id,:name,:kind,:created_at)", sensor)
        return sensor

    def delete_sensor(self, sensor_id: str) -> bool:
        with self.lock, self.connection:
            used = self.connection.execute("SELECT 1 FROM media WHERE sensor_id=? LIMIT 1", (sensor_id,)).fetchone()
            if used:
                raise MediaError("Sensor has preserved media and cannot be deleted")
            return bool(self.connection.execute("DELETE FROM virtual_sensors WHERE id=?", (sensor_id,)).rowcount)

    def save(self, data: bytes, *, original_name: str, site_id: str, sensor_id: str) -> dict:
        extension = Path(original_name).suffix.lower().lstrip(".")
        if extension not in MEDIA_TYPES or len(original_name) > 200:
            raise MediaError("Unsupported media filename or extension")
        with self.lock:
            sensor = self.connection.execute("SELECT * FROM virtual_sensors WHERE id=? AND site_id=?", (sensor_id, site_id)).fetchone()
            if not sensor:
                raise MediaError("Virtual sensor does not belong to this site")
            expected_kind = "microphone" if extension in ("wav", "mp3") else "camera"
            if sensor["kind"] != expected_kind:
                raise MediaError("Media type does not match virtual sensor")
            media_id = uuid.uuid4().hex
            destination = self.storage / f"{media_id}.{extension}"
            destination.write_bytes(data)
            try:
                metadata = validate_media(destination, extension)
            except Exception:
                destination.unlink(missing_ok=True)
                raise
            row = {"id": media_id, "site_id": site_id, "sensor_id": sensor_id,
                   "original_name": Path(original_name).name, "extension": extension,
                   "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data),
                   "metadata_json": json.dumps(metadata), "state": "ready",
                   "created_at": datetime.now(timezone.utc).isoformat()}
            with self.connection:
                self.connection.execute("INSERT INTO media VALUES (:id,:site_id,:sensor_id,:original_name,:extension,:sha256,:bytes,:metadata_json,:state,:created_at)", row)
            return self.get(media_id)

    def get(self, media_id: str) -> dict | None:
        with self.lock:
            row = self.connection.execute("SELECT * FROM media WHERE id=?", (media_id,)).fetchone()
            if not row:
                return None
            result = dict(row)
            result["metadata"] = json.loads(result.pop("metadata_json"))
            return result

    def list(self) -> list[dict]:
        with self.lock:
            ids = [row[0] for row in self.connection.execute("SELECT id FROM media ORDER BY created_at DESC LIMIT 100")]
        return [self.get(media_id) for media_id in ids]

    def path(self, media: dict) -> Path:
        return self.storage / f"{media['id']}.{media['extension']}"

    def annotate(self, media_id: str, label: str, reviewer: str, note: str) -> dict:
        if label not in ("positive", "negative", "uncertain") or not reviewer.strip() or len(note) > 1000:
            raise MediaError("Invalid annotation")
        if not self.get(media_id):
            raise MediaError("Media not found")
        row = {"id": uuid.uuid4().hex, "media_id": media_id, "label": label,
               "reviewer": reviewer.strip()[:80], "note": note,
               "created_at": datetime.now(timezone.utc).isoformat()}
        with self.lock, self.connection:
            self.connection.execute("INSERT INTO annotations VALUES (:id,:media_id,:label,:reviewer,:note,:created_at)", row)
        return row

    def annotations(self, media_id: str) -> list[dict]:
        with self.lock:
            return [dict(row) for row in self.connection.execute("SELECT * FROM annotations WHERE media_id=? ORDER BY created_at", (media_id,))]


def wav_visualization(path: Path) -> dict:
    started = perf_counter()
    with wave.open(str(path), "rb") as audio:
        rate, channels, width = audio.getframerate(), audio.getnchannels(), audio.getsampwidth()
        if width not in (1, 2, 4):
            raise MediaError("WAV sample width unsupported for plots")
        dtype = {1: np.uint8, 2: np.int16, 4: np.int32}[width]
        data = np.frombuffer(audio.readframes(min(audio.getnframes(), rate * 30)), dtype=dtype).astype(np.float32)
        if width == 1:
            data = (data - 128) / 128
        else:
            data /= float(2 ** (width * 8 - 1))
        signal = data.reshape(-1, channels).mean(axis=1)
    if len(signal) < 512:
        raise MediaError("WAV too short for spectral plots")
    waveform = [round(float(np.sqrt(np.mean(chunk ** 2))), 4) for chunk in np.array_split(signal, 128)]
    nfft, hop = 1024, 512
    fft = np.abs(np.fft.rfft(signal[:min(len(signal), rate * 5)] * np.hanning(min(len(signal), rate * 5))))
    freqs = np.fft.rfftfreq(min(len(signal), rate * 5), 1 / rate)
    points = np.linspace(0, len(fft) - 1, 128, dtype=int)
    spectrum = [{"hz": round(float(freqs[i]), 1), "db": round(float(20 * np.log10(fft[i] + 1e-6)), 2)} for i in points]
    frames = np.lib.stride_tricks.sliding_window_view(signal, nfft)[::hop]
    if len(frames) > 96:
        frames = frames[np.linspace(0, len(frames) - 1, 96, dtype=int)]
    power = np.abs(np.fft.rfft(frames * np.hanning(nfft), axis=1)) ** 2
    mel_edges = np.linspace(0, 2595 * np.log10(1 + rate / 2 / 700), 66)
    hz_edges = 700 * (10 ** (mel_edges / 2595) - 1)
    bins = np.clip(np.floor(hz_edges / rate * nfft).astype(int), 0, nfft // 2)
    filters = np.zeros((64, nfft // 2 + 1), dtype=np.float32)
    for index in range(64):
        left, middle, right = bins[index:index + 3]
        if middle > left:
            filters[index, left:middle] = np.linspace(0, 1, middle - left, endpoint=False)
        if right > middle:
            filters[index, middle:right] = np.linspace(1, 0, right - middle, endpoint=False)
    mel = 10 * np.log10(np.maximum(power @ filters.T, 1e-10))
    mel = np.maximum(mel, mel.max() - 80)
    return {"source": "processed_uploaded_wav", "waveform_rms": waveform,
            "fft_spectrum": spectrum, "log_mel_db": np.round(mel.T, 1).tolist(),
            "sample_rate_hz": rate, "duration_s": round(len(signal) / rate, 3),
            "processing_ms": round((perf_counter() - started) * 1000, 3),
            "note": "Research visualization; not the organizer's undocumented model preprocessing."}
