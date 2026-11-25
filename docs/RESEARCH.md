# VIGILAIR ONE — research baseline

## Brief synthesis

The EDTH Berlin event runs 27–29 November 2026 in Berlin and explicitly lists Counter-UAS, sensing/ISR, computer vision and edge AI, and scalable/cost-efficient deployment as focus areas. The challenge brief supplied for this project adds the operational acceptance criteria: persistent tracking, behavior-based alerts, explainability, operator accept/reject/modify workflows, incident export, and simulated resource allocation with no weapon or interceptor control.

## Intended first customer

Security operations teams at airports, power plants, and defense manufacturers in the Berlin-Brandenburg region. The first buyer is the site security lead or critical-infrastructure operator who already monitors ordinary CCTV feeds and needs a low-cost triage layer rather than a new sensor system.

## MVP decision

1. Start with prerecorded or synthetic tracks so the demo is deterministic and legally simple.
2. Use ordinary camera feeds and an edge-friendly detector/tracker interface; keep detection pluggable so hardware can be attached at the hackathon.
3. Implement explainable risk as a transparent score from dwell time, geofence proximity, trajectory change, and classification confidence.
4. Keep all response actions human-approved and simulated: notify liaison, pause an affected zone, warn staff, preserve evidence, allocate a camera/operator resource.
5. Export a timestamped incident report for handoff.

## Deployment concept

Each camera publishes a low-resolution stream to a small local edge box. Detection and tracking run locally; only metadata, thumbnails, and selected evidence clips move to a site console. A site gateway merges tracks across cameras using time, appearance, and predicted motion. Multiple sites can share a lightweight fleet view with tenant isolation and store-and-forward operation when connectivity is degraded.

## Featherless integration

Featherless is a candidate for optional language/vision assistance through its OpenAI-compatible API. Use it only for operator-facing summaries or model comparison; the safety-critical risk score should remain deterministic and inspectable. Configure `FEATHERLESS_API_KEY` locally and never commit it. The EDTH promo code in the supplied brief is `EDTH26` and is valid through 31 December 2026 according to that brief.

## Sources checked

- EDTH Berlin event page: https://events.eurodefense.tech/berlin-2026
- Featherless platform: https://featherless.ai/
