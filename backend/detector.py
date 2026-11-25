"""Optional YOLO detector wrapper with a stable output contract."""
from typing import Any

class Detector:
    def __init__(self, model_name: str = "yolo11n.pt", device: str = "cpu", confidence: float = 0.35):
        self.model_name, self.device, self.confidence = model_name, device, confidence
        self._model: Any = None

    def load(self) -> None:
        from ultralytics import YOLO
        self._model = YOLO(self.model_name)

    def detect(self, frame: Any) -> list[dict]:
        if self._model is None: self.load()
        results = self._model.predict(frame, device=self.device, conf=self.confidence, verbose=False)
        detections = []
        for result in results:
            for box in result.boxes:
                coords = [float(value) for value in box.xyxy[0].tolist()]
                detections.append({"class_id": int(box.cls[0]), "confidence": float(box.conf[0]), "bbox_xyxy": coords})
        return detections
