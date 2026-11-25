# Models, environment, and integration plan

## Recommended model stack

### Detection

Start with a small YOLO-family detector through Ultralytics (`yolo11n.pt` in the example environment). For the hackathon, benchmark it against organizer-provided footage and synthetic night scenes. The target is stable recall at the smallest acceptable compute cost, not a claim of production accuracy.

### Tracking

Use ByteTrack first because it is fast and does not require an appearance model. Add BoT-SORT or an embedding-assisted association layer if camera handoff becomes the dominant error source.

### Optional vision-language model

Use Featherless only for operator-facing summaries, evidence narration, or model comparison. Suggested starting model: `zai-org/GLM-5.3-Flash` or another available small vision/instruct model. Do not let a language model directly set the risk score or trigger external action.

### Optional edge acceleration

ONNX Runtime or a vendor runtime can reduce latency on the provided edge hardware. Keep the detector interface stable so the model can be swapped without changing the console or incident contract.

## Environment setup

1. Copy `.env.example` to `.env`.
2. For the demo, leave `MODEL_PROVIDER=local` and `FEATHERLESS_API_KEY` empty.
3. Create a Featherless key only if using the optional summary/model-comparison path, then set the key locally; never commit `.env`.
4. Install Python dependencies with `python -m venv .venv` followed by `pip install -r requirements.txt`.
5. Start the API with `uvicorn backend.main:app --reload` or `scripts/run_demo.ps1` on Windows.

## Hardware inputs to expect

The system can start with four USB/IP RGB cameras and a laptop/edge box. If available, add a thermal camera and radar/Remote ID feed as independent adapters. Every adapter should emit normalized observations rather than coupling hardware SDKs into the risk engine.
