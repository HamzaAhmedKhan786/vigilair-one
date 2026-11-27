# Challenge 05 model integration

The organizer pack is an external, local dataset. Keep its WAV, PNG, MP4 and any trained weights outside Git. The repository's model adapter uses the organizer's released **224 x 224 RGB log-Mel PNG** contract. The acoustic ONNX graph expects float32 NCHW data scaled to `[0, 1]`, with ImageNet normalization inside the graph. Outputs are `wake_logit` and `sound_class_logits`. The four class names and their order come from the starter kit.

## What is available

The local pack inspected on 27 November 2026 has 276 train, 56 validation and 54 test clips; 386 WAVs and 386 spectrograms; 18 train and 1 validation paired MP4s. Test rows contain only IDs and media paths. No ONNX weights are present in that pack, so predictions and benchmarks are unavailable until a model is trained or supplied. The organizer's historical baseline metrics predate the rebuilt split and must not be shown as current results.

The pack's `dataset_card.json` says its labels were teacher and DSP gated and reports zero human-reviewed clips. Treat the labels as the released benchmark labels, not independently confirmed field truth.

## Configure

Install `requirements.txt`. In local `.env`, set:

```text
CHALLENGE05_DATASET_DIR=C:/path/to/challenge-5-acoustic-visual-cuas
ACOUSTIC_MODEL_PATH=artifacts/models/audio_wake_cnn.onnx
ACOUSTIC_ONNX_SHA256=<trusted 64-character SHA256>
```

The model file may instead be at an absolute path. The SHA256 is optional but recommended. The ONNX model must contain `wake_threshold` metadata selected on validation; for an older export, set `ACOUSTIC_WAKE_THRESHOLD` to a threshold chosen on validation. Do not tune on the held-out test split. Keep weights under the ignored `artifacts/` directory or another trusted external location.

If the training machine produces the organizer starter kit's `audio_wake_best.pt`, set `ACOUSTIC_MODEL_PATH` to that file, install `requirements-model-pt.txt`, and set `ACOUSTIC_WAKE_THRESHOLD` explicitly because the `.pt` state dict contains weights only. Set `ACOUSTIC_ARCHITECTURE` to `mobilenet_v3_small` or `resnet18`, matching training. The `.pt` adapter reconstructs the known architecture with no pretrained download and loads only a plain tensor state dict with `torch.load(weights_only=True)` and strict key checking. Arbitrary pickled models and unknown custom architectures are rejected. The same CLI `infer` and `batch` commands accept `.pt` or `.pth` paths.

On the training machine, keep the starter kit's `audio_wake_best.pt` and `audio_wake_cnn.onnx` together with the selected validation threshold, architecture, class order, training commit, dataset split manifest hashes, and each model's SHA256. Transfer the files through a trusted channel into `artifacts/models/` here. The starter kit exports both formats after training; ONNX includes the threshold as metadata, while its `.pt` contains only weights. If a different trainer saves a full pickled model, a wrapper checkpoint, changed class order or different spectrogram preprocessing, provide its model definition and metadata before using it. Do not force it through this adapter.

## Audit and inference

Run these from the repository root. Replace paths with the local dataset and model locations.

```powershell
python -m scripts.challenge05_models audit --dataset-dir "C:/path/to/challenge-5-acoustic-visual-cuas" --inspect-media
python -m scripts.challenge05_models infer --model artifacts/models/audio_wake_cnn.onnx --png "C:/path/to/challenge-5-acoustic-visual-cuas/spectrograms/valid/c5_0022.png"
python -m scripts.challenge05_models infer --model artifacts/models/audio_wake_best.pt --wake-threshold 0.75 --png "C:/path/to/challenge-5-acoustic-visual-cuas/spectrograms/valid/c5_0022.png"
python -m scripts.challenge05_models batch --dataset-dir "C:/path/to/challenge-5-acoustic-visual-cuas" --model artifacts/models/audio_wake_cnn.onnx --split valid --out artifacts/challenge05/valid_predictions.jsonl --details artifacts/challenge05/valid_details.jsonl
```

`batch` writes the organizer's submission fields (`id`, `wake_triggered`, `sound_class`). `--details` adds class scores, wake probability, model checksum and ONNX-only inference time. Score the validation submission with the organizer's `starter-kit/evaluate_submissions.py acoustic`; only use the organizer's evaluator for official metrics.

The API exposes `GET /api/models/acoustic/status`, `GET /api/models/acoustic/dataset`, and `POST /api/models/acoustic/predict`. The POST body is **PNG bytes** with `Content-Type: image/png`, at most 2 MiB. For example:

```powershell
curl.exe -X POST "http://127.0.0.1:8000/api/models/acoustic/predict" -H "Content-Type: image/png" --data-binary "@C:/path/to/spectrogram.png"
```

The response reports `source: submitted_png`; the API does not attest to the recording origin. If the ONNX model is absent or incompatible, the endpoint returns 503 and the status endpoint reports it as unavailable.

## Input and output boundary

`audio/<split>/c5_XXXX.wav` is 5 seconds, 16 kHz, mono, 16-bit PCM. `spectrograms/<split>/c5_XXXX.png` is 224 x 224. The released pack does not specify the full WAV-to-PNG conversion recipe, so this adapter does **not** convert arbitrary live WAV into model input. The existing FFT feature endpoint remains available for exploratory audio observations, but it is not equivalent to the trained classifier. Integrating live microphone audio requires a documented preprocessing recipe matching training, then validation against the official PNG pathway.

Wake probability is a sigmoid of the wake logit. Sound-class scores are softmax values in starter-kit class order. The wake decision uses the validation-selected threshold. Inference timing excludes file loading, PNG decode, audio capture, preprocessing, camera activation and display refresh. Acoustic evidence alone does not establish a location or guarantee recognition of a quiet drone.

The existing YOLO replay remains the visual path. RF-DETR Nano is an optional visual comparison; it requires a full verified inference export and a matching class map. The pack warns that the backbone-only export lacks a runnable host decoder. Multi-site association remains a reviewed candidate workflow using calibrated or synthetic coordinates, not a geographic position inferred from sound class.

For optional RF-DETR Nano, set `RFDETR_ONNX_PATH`, `RFDETR_ONNX_SHA256` and `RFDETR_CLASS_NAMES` in `.env`. The class names must match the trained model's exact output order; the Challenge 05 pack does not provide a detector class map. The full export must accept `[1,3,384,384]` ImageNet-normalized float32 frames and emit `dets` and `labels`. `GET /api/models/visual/status` and `POST /api/models/visual/predict` mirror the acoustic status and inference flow. The visual POST accepts up to 4 MiB of PNG or JPEG bytes and returns pixel boxes, class names, confidence and ONNX-only inference time. It does not issue camera or physical-device commands.

The visual adapter does not load arbitrary RF-DETR `.pt` checkpoints. Keep the existing YOLO `.pt` replay path for YOLO weights. For an RF-DETR Nano checkpoint, export and verify a **full** ONNX detector on the training machine, or provide the exact trainer architecture and checkpoint schema to build a constrained PyTorch adapter. A backbone-only ONNX export is not suitable for this API.

```powershell
python -m scripts.challenge05_models visual-infer --model artifacts/models/rfdetr_nano_full.onnx --image artifacts/frames/frame.png --class-name drone --class-name bird
curl.exe -X POST "http://127.0.0.1:8000/api/models/visual/predict" -H "Content-Type: image/png" --data-binary "@C:/path/to/frame.png"
```
