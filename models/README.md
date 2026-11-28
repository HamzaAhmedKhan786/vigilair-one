# Local research model packages

`registry.json` declares four research packages. A complete `models/<package-id>/package.json` can override a placeholder or add a package. The API discovers package manifests and artifact changes automatically; **Refresh packages** forces immediate revalidation. Weights remain ignored by Git. Each package requires its own preprocessing, class mapping, input/output contract, provenance and checksum metadata before the registry can mark it compatible. Registry compatibility checks metadata and bytes; it does not claim model accuracy or execute weights.

The acoustic hybrid package has a CNN artifact and an independently evaluated LIF/SNN component. Until both are supplied, the synthetic spike replay remains a fixture. The MobileNetV3-Small package follows the organizer's Challenge 05 contract. RF-DETR Nano requires a full detector export; YOLO remains a comparison path. See `docs/RESEARCH_DEMO.md` for the package schema and offline evaluation boundary.
