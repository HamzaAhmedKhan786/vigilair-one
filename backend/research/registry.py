"""Metadata-only model package registry; never deserializes discovered weights."""

import hashlib
import json
from pathlib import Path
from threading import RLock


class PackageRegistry:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self._lock = RLock()
        self._fingerprint = None
        self._snapshot = self.refresh()

    def _files_fingerprint(self) -> tuple:
        paths = [self.root / "registry.json"]
        paths.extend(path for directory in self.root.iterdir() if directory.is_dir() and directory.resolve().is_relative_to(self.root)
                     for path in directory.iterdir() if path.is_file() and path.suffix.lower() in {".json", ".pt", ".pth", ".onnx", ".safetensors"})
        return tuple(sorted((str(path.relative_to(self.root)), path.stat().st_size, path.stat().st_mtime_ns)
                            for path in paths if path.is_file()))

    def refresh(self) -> dict:
        with self._lock:
            manifest = json.loads((self.root / "registry.json").read_text(encoding="utf-8"))
            if manifest.get("schema_version") != 1 or not isinstance(manifest.get("packages"), list):
                raise ValueError("Unsupported model registry schema")
            declared = {package["id"]: package for package in manifest["packages"]}
            for directory in self.root.iterdir():
                package_file = directory / "package.json"
                if not directory.is_dir() or not directory.resolve().is_relative_to(self.root) or not package_file.is_file():
                    continue
                discovered = json.loads(package_file.read_text(encoding="utf-8"))
                if not isinstance(discovered, dict) or discovered.get("id") != directory.name:
                    raise ValueError(f"Invalid package manifest in {directory.name}")
                declared[discovered["id"]] = discovered
            packages = []
            ids = set()
            for package in declared.values():
                package_id = package.get("id")
                if not isinstance(package_id, str) or package_id in ids or not package_id.replace("-", "").isalnum():
                    raise ValueError("Invalid or duplicate model package ID")
                ids.add(package_id)
                problems = []
                for key in ("version", "family", "preprocessing", "inputs", "outputs", "provenance", "classes", "artifacts"):
                    if key not in package:
                        problems.append(f"missing {key}")
                provenance = package.get("provenance") or {}
                if not isinstance(provenance, dict) or any(provenance.get(key) in (None, "", "pending") for key in ("training_source", "dataset_version", "license")):
                    problems.append("provenance incomplete")
                if package.get("version") in (None, "", "0.0.0", "pending"):
                    problems.append("model version incomplete")
                if not package.get("classes"):
                    problems.append("class mapping missing")
                if not package.get("preprocessing") or not package.get("inputs") or not package.get("outputs"):
                    problems.append("input/output or preprocessing contract incomplete")
                if "specify before use" in json.dumps({key: package.get(key) for key in ("preprocessing", "inputs", "outputs")}).lower():
                    problems.append("tensor specification incomplete")
                artifacts = []
                for artifact in package.get("artifacts", []):
                    relative = Path(str(artifact.get("path", "")))
                    path = (self.root / relative).resolve()
                    problem = None
                    if relative.is_absolute() or not path.is_relative_to(self.root) or relative.suffix.lower() not in {".pt", ".pth", ".onnx", ".safetensors"}:
                        problem = "unsafe or unsupported artifact path"
                    elif not path.is_file():
                        problem = "artifact missing"
                    elif not artifact.get("sha256"):
                        problem = "checksum missing"
                    else:
                        with path.open("rb") as stream:
                            actual = hashlib.file_digest(stream, "sha256").hexdigest()
                        if actual != artifact["sha256"].lower():
                            problem = "checksum mismatch"
                    if problem:
                        problems.append(f"{artifact.get('role', 'artifact')}: {problem}")
                    artifacts.append({"role": artifact.get("role"), "format": artifact.get("format"),
                                      "present": problem != "artifact missing", "validation": problem or "checksum verified"})
                if not artifacts:
                    problems.append("no artifacts declared")
                packages.append({"id": package_id, "name": package.get("name"), "family": package.get("family"),
                                 "version": package.get("version"), "preprocessing": package.get("preprocessing"),
                                 "classes": package.get("classes"), "inputs": package.get("inputs"),
                                 "outputs": package.get("outputs"), "provenance": provenance,
                                 "artifacts": artifacts, "status": "missing" if any("missing" in item for item in problems) else "incompatible" if problems else "package_complete_unverified",
                                 "issues": problems})
            self._snapshot = {"schema_version": 1, "packages": packages, "note": "Package checks do not measure accuracy or execute model weights."}
            self._fingerprint = self._files_fingerprint()
            return self._snapshot

    def snapshot(self) -> dict:
        with self._lock:
            if self._files_fingerprint() != self._fingerprint:
                return self.refresh()
            return self._snapshot
