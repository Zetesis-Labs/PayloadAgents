# Changelog

## [0.1.4](https://github.com/Zetesis-Labs/PayloadAgents/compare/nexus-queue-v0.1.3...nexus-queue-v0.1.4) (2026-06-18)


### Bug Fixes

* **nexus-queue:** claim-based idempotency, per-tenant namespace, re-park retries ([0478b87](https://github.com/Zetesis-Labs/PayloadAgents/commit/0478b87f4f4218b72ae87affcf091119d2350401))

## [0.1.3](https://github.com/Zetesis-Labs/PayloadAgents/compare/nexus-queue-v0.1.2...nexus-queue-v0.1.3) (2026-06-17)


### Bug Fixes

* **nexus-queue:** import OTLP exporter lazily so the worker runs untraced without it ([#102](https://github.com/Zetesis-Labs/PayloadAgents/issues/102)) ([9c0a3f6](https://github.com/Zetesis-Labs/PayloadAgents/commit/9c0a3f62d2cffbafa33defb89b81a97a0920b738))

## [0.1.2](https://github.com/Zetesis-Labs/PayloadAgents/compare/nexus-queue-v0.1.1...nexus-queue-v0.1.2) (2026-06-17)


### Features

* **nexus-queue:** serve worker Prometheus metrics over HTTP ([#100](https://github.com/Zetesis-Labs/PayloadAgents/issues/100)) ([cb5af8a](https://github.com/Zetesis-Labs/PayloadAgents/commit/cb5af8aaa944681358175e425ef88b2ee9e282be))

## [0.1.1](https://github.com/Zetesis-Labs/PayloadAgents/compare/nexus-queue-v0.1.0...nexus-queue-v0.1.1) (2026-06-17)


### Features

* introduce the Nexus-Queue standard (runtime + TS client) ([fa0672c](https://github.com/Zetesis-Labs/PayloadAgents/commit/fa0672c17f87ca76c2eaf7dd3295417c560b6d40))
* introduce the Nexus-Queue standard (runtime + TS client) ([73fce93](https://github.com/Zetesis-Labs/PayloadAgents/commit/73fce93fdc208efed95c573a1c89f69f1fc79d51))
* **nexus-queue:** configure an OTLP tracing exporter when an endpoint is set ([a9167fa](https://github.com/Zetesis-Labs/PayloadAgents/commit/a9167fa33c8ce629d51176a48c38bc73ef700545))
* **nexus-queue:** configure OTLP tracing exporter when endpoint set ([49e0ed8](https://github.com/Zetesis-Labs/PayloadAgents/commit/49e0ed8974ee217c23ebfca2d97e8883d8f34ad0))
* **nexus-queue:** harden the worker runtime (idempotency, backoff, metrics) ([9e7804a](https://github.com/Zetesis-Labs/PayloadAgents/commit/9e7804abdb5f12414bcf91ea10fbca0d874b4f97))


### Bug Fixes

* **security:** timing-safe internal-secret compare + LlamaParse upload limits ([77ac5c6](https://github.com/Zetesis-Labs/PayloadAgents/commit/77ac5c6954abb196b25f3cb3ef0fe120fa32ca28))
