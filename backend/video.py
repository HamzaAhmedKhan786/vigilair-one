"""Live video input scaffold. Detection remains injected to keep hardware SDKs optional."""
from collections.abc import Iterator
from pathlib import Path
import cv2

def frames(source: str | int, max_frames: int | None = None) -> Iterator[tuple[int, object]]:
    capture = cv2.VideoCapture(source)
    if not capture.isOpened(): raise RuntimeError(f"unable to open video source: {source}")
    index = 0
    try:
        while max_frames is None or index < max_frames:
            ok, frame = capture.read()
            if not ok: break
            yield index, frame
            index += 1
    finally:
        capture.release()
