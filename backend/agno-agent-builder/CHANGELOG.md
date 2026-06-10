# Changelog

## [0.1.9](https://github.com/Zetesis-Labs/PayloadAgents/compare/agno-agent-builder-v0.1.8...agno-agent-builder-v0.1.9) (2026-05-21)


### Features

* **agno-agent-builder:** forward SearchProfile retrieval params as MCP headers ([57aba22](https://github.com/Zetesis-Labs/PayloadAgents/commit/57aba223031d5c8f35bcc64f114781a0eedb156c))
* **mcp-typesense:** add reranker closure primitives and factory ([61cfaf2](https://github.com/Zetesis-Labs/PayloadAgents/commit/61cfaf201f922bb79395e3e1522b1f7f0fc22f00))
* **mcp-typesense:** apply SearchProfile.queryRewrite Mustache template before retrieval ([d00479a](https://github.com/Zetesis-Labs/PayloadAgents/commit/d00479a69227c6434ec003495571382df8c32d4b))
* SearchProfiles collection + reranker closures for two-stage retrieval ([4206f73](https://github.com/Zetesis-Labs/PayloadAgents/commit/4206f738fd1589d1c8ed8000bf9013354710bcd5))

## [0.1.8](https://github.com/Zetesis-Labs/PayloadAgents/compare/agno-agent-builder-v0.1.7...agno-agent-builder-v0.1.8) (2026-05-17)


### Bug Fixes

* **security:** timing-safe internal-secret compare + LlamaParse upload limits ([77ac5c6](https://github.com/Zetesis-Labs/PayloadAgents/commit/77ac5c6954abb196b25f3cb3ef0fe120fa32ca28))

## [0.1.7](https://github.com/Zetesis-Labs/PayloadAgents/compare/agno-agent-builder-v0.1.6...agno-agent-builder-v0.1.7) (2026-05-17)


### Features

* **agno-agent-builder:** add Langfuse OTel tracing with per-tenant project routing ([82d3dde](https://github.com/Zetesis-Labs/PayloadAgents/commit/82d3ddeb62cdba48fffa177056a4fd5f942de5ee))
* **agno-agent-builder:** bring back per-tenant Langfuse project routing ([ddb3ef6](https://github.com/Zetesis-Labs/PayloadAgents/commit/ddb3ef6dfa22108893fc5d8f01804b5c461ed0f9))
* **agno-agent-builder:** Langfuse OTel tracing with tag-based filtering ([d45d4f3](https://github.com/Zetesis-Labs/PayloadAgents/commit/d45d4f360ad30797509e3c3b8fe2e51d9f1b65a4))
* **agno-agent-builder:** listen on tenant_reload channel to invalidate Langfuse key cache ([530c052](https://github.com/Zetesis-Labs/PayloadAgents/commit/530c0527d9d0c5ed2f3f2aaad54453efa54ee67d))
* **agno-microsoft-teams:** add typing indicators and adaptive cards ([e19a9be](https://github.com/Zetesis-Labs/PayloadAgents/commit/e19a9be3c6dd6d406405f4be02bc1876fe0737ba))


### Bug Fixes

* **agno-agent-builder:** coerce baggage tenant_id to str for span attributes ([509c8a6](https://github.com/Zetesis-Labs/PayloadAgents/commit/509c8a6970eb2b4bd677dd5f6c392c01fafc953e))


### Reverts

* **agno-agent-builder:** drop per-tenant Langfuse routing and tenant_reload listener ([b3036bd](https://github.com/Zetesis-Labs/PayloadAgents/commit/b3036bd6d517ae7b0a2fd0bfd9e759d97c4cea97))

## [0.1.6](https://github.com/Zetesis-Labs/PayloadAgents/compare/agno-agent-builder-v0.1.5...agno-agent-builder-v0.1.6) (2026-05-13)


### Features

* **agno-agent-builder:** add Teams channel support ([c937a81](https://github.com/Zetesis-Labs/PayloadAgents/commit/c937a81615b56b70350bae9b0a84d8cfffd8bc6f))
* **agno-agent-builder:** Microsoft Teams channel + attachment intake (Teams + Discord) ([f0dd9af](https://github.com/Zetesis-Labs/PayloadAgents/commit/f0dd9afd2de75e8ae87180da70faedf80351dd53))
* **agno-microsoft-teams:** extract Teams interface package ([ba7962b](https://github.com/Zetesis-Labs/PayloadAgents/commit/ba7962bc1d542171af39dbed3516887bf922626f))


### Bug Fixes

* **teams:** harden runtime and package publishing ([f99459b](https://github.com/Zetesis-Labs/PayloadAgents/commit/f99459be32408009806191e0dd236e6fddbc2d40))

## [0.1.5](https://github.com/Zetesis-Labs/PayloadAgents/compare/agno-agent-builder-v0.1.4...agno-agent-builder-v0.1.5) (2026-05-09)


### Features

* **mcp-typesense,payload-agents-core:** scope MCP search by folder ([#68](https://github.com/Zetesis-Labs/PayloadAgents/issues/68)) ([43dbd87](https://github.com/Zetesis-Labs/PayloadAgents/commit/43dbd87481e1c4fe63bc6ae5c931dedffb258518))

## [0.1.4](https://github.com/Zetesis-Labs/PayloadAgents/compare/agno-agent-builder-v0.1.3...agno-agent-builder-v0.1.4) (2026-05-07)


### Features

* **agno-agent-builder:** listen on channel_reload + restart on notify ([9a54f94](https://github.com/Zetesis-Labs/PayloadAgents/commit/9a54f94860b06b21d95ccddb1ef2e720bc1f5572))
* replace chat-agent with AG-UI based @zetesis/agent-ui ([#64](https://github.com/Zetesis-Labs/PayloadAgents/issues/64)) ([adf5acd](https://github.com/Zetesis-Labs/PayloadAgents/commit/adf5acd9cf110bf0339389c215be2075bbf69e5e))

## [0.1.3](https://github.com/Zetesis-Labs/PayloadAgents/compare/agno-agent-builder-v0.1.2...agno-agent-builder-v0.1.3) (2026-05-05)


### Features

* **agno-agent-builder:** channel-agnostic loader + WhatsApp + Discord ([#57](https://github.com/Zetesis-Labs/PayloadAgents/issues/57)) ([25766b5](https://github.com/Zetesis-Labs/PayloadAgents/commit/25766b57ed5912d97e3141e8f6d87b2a78c57445))

## [0.1.2](https://github.com/Zetesis-Labs/PayloadAgents/compare/agno-agent-builder-v0.1.1...agno-agent-builder-v0.1.2) (2026-04-30)


### Bug Fixes

* **agno-agent-builder:** bump agno minimum to 2.6.0 for AgentFactory ([0e5a508](https://github.com/Zetesis-Labs/PayloadAgents/commit/0e5a508c881b3ab71450ff97686fb90cdd8e0f0f))

## [0.1.1](https://github.com/Zetesis-Labs/PayloadAgents/compare/agno-agent-builder-v0.1.0...agno-agent-builder-v0.1.1) (2026-04-30)


### Features

* uv workspace backend + MCP token taxonomies + release-please ([#44](https://github.com/Zetesis-Labs/PayloadAgents/issues/44)) ([5ffdff5](https://github.com/Zetesis-Labs/PayloadAgents/commit/5ffdff5b574026a6a16be52166c1be350c1ad326))
