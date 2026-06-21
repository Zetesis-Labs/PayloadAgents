# PayloadAgents

Open-source [Payload CMS](https://payloadcms.com) plugins for **semantic search, RAG-powered chat, AI agents, taxonomy management, and content rendering** — extracted from [Zetesis Portal](https://zetesis.xyz), a production platform that turns organizational knowledge into accessible, AI-powered experiences.

> **ζήτησις** (zḗtēsis) — _inquiry_. Zetesis builds systems that make company expertise searchable and conversational through semantic search, AI agents, and structured content. These packages are the open-source core of that work.

## Packages

### npm packages (`packages/*`) — `@zetesis/*`

| Package | Description |
|---------|-------------|
| [`payload-indexer`](packages/payload-indexer) | Collection sync & embedding pipeline — hooks into the Payload lifecycle to extract, chunk, embed, and push documents to a search backend |
| [`payload-typesense`](packages/payload-typesense) | Typesense adapter with search endpoints, vector/hybrid search, and RAG chat integration |
| [`payload-taxonomies`](packages/payload-taxonomies) | Hierarchical taxonomies with breadcrumb navigation and relationship field builders |
| [`payload-lexical-blocks-builder`](packages/payload-lexical-blocks-builder) | Lexical editor blocks builder & server-side renderer |
| [`payload-agents-core`](packages/payload-agents-core) | AI agents in Payload — agent collections, LiteLLM gateway admin, per-agent virtual keys (BYOK) |
| [`payload-agents-metrics`](packages/payload-agents-metrics) | Agent run & cost metrics (real gateway cost or static estimate) |
| [`payload-documents`](packages/payload-documents) | Documents collection with PDF parsing (LlamaParse) via the queue worker |
| [`agent-ui`](packages/agent-ui) | Floating chat UI (AG-UI based) with streaming responses, session management, and agent selection |
| [`mcp-typesense`](packages/mcp-typesense) | MCP server exposing the indexed content over the Model Context Protocol |
| [`nexus-queue`](packages/nexus-queue) | Taskiq + Redis Streams queue helpers (TypeScript side) |

### Python services (`backend/*`)

uv workspace for the agent runtime and workers — published to PyPI by release-please.

| Package | Description |
|---------|-------------|
| `agno-agent-builder` | Agno-based agent runtime factory (FastAPI), routed through the LiteLLM gateway |
| `agno-agent` | Thin runtime that wires `agno-agent-builder` to Payload as the agent source |
| `nexus-queue` | Taskiq + Redis Streams worker base |
| `payload-documents-worker-builder` / `payload-documents-worker` | LlamaParse PDF parser running on the queue |

### Apps (`apps/*`, private)

| App | Description |
|-----|-------------|
| `server` | Payload CMS playground (Next.js) that wires every package together |
| `mcp` | MCP server — thin wrapper around `@zetesis/mcp-typesense` (runs on Bun) |

## Quick start

### Prerequisites

- [Node.js](https://nodejs.org) 24 (matches CI; the Dev Container ships it)
- [pnpm](https://pnpm.io) 10
- [Docker](https://www.docker.com) (PostgreSQL, Typesense, Redis, LiteLLM)
- For the Python backend outside the Dev Container: [uv](https://docs.astral.sh/uv/) + Python 3.12

### Option A — Dev Container (recommended)

A full Dev Container ships PostgreSQL, Typesense, Redis, the **LiteLLM gateway**, all JS/Python tooling (Node 24, pnpm, uv + Python 3.12, Bun) and the dev env vars pre-configured in `.devcontainer/devcontainer.env` — **no env copying needed**.

1. Open the repo in VS Code / Cursor and **Reopen in Container**.
2. (Optional) Provide your own provider keys for real LLM/embeddings calls: export `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` on your host (injected via `containerEnv`) or add them to `.devcontainer/devcontainer.env.local` (gitignored).
3. Start the stack from **Run & Debug → "Launch"** (Server + MCP + Agent Runtime + Workers), or for just the TS side run:

   ```bash
   pnpm dev        # Server (:3000) + MCP (:3030)
   ```

4. Open:
   - [localhost:3000/admin](http://localhost:3000/admin) — Payload admin
   - [localhost:3000](http://localhost:3000) — playground
   - [localhost:4000/ui/](http://localhost:4000/ui/) — LiteLLM Admin UI (`admin` / `admin`)
   - [localhost:8081](http://localhost:8081) — Typesense Dashboard

### Option B — Manual setup

1. **Clone & install:**

   ```bash
   git clone https://github.com/Zetesis-Labs/payload-agents.git
   cd payload-agents
   pnpm install
   ```

2. **Start infrastructure** (PostgreSQL + Typesense + Redis + LiteLLM):

   ```bash
   docker compose -f .devcontainer/docker-compose.yml up -d db typesense redis litellm
   ```

3. **Configure environment:** the playground reads `apps/server/.env` (see `apps/server/.env.example`). At minimum set `DATABASE_URL`, `PAYLOAD_SECRET`, `TYPESENSE_*`, and `OPENAI_API_KEY` (embeddings).

4. **Run the playground:**

   ```bash
   cd apps/server && pnpm run dev
   ```

5. **Run the Python backend** (agent runtime + workers):

   ```bash
   cd backend
   cp .env.example .env   # set ANTHROPIC_API_KEY / OPENAI_API_KEY for BYOK
   uv sync --all-packages
   uv run --package agno-agent uvicorn agno_agent.main:app --reload --host 0.0.0.0 --port 8000
   ```

## Project structure

```
payload-agents/
├── apps/
│   ├── server/          # Payload CMS playground (Next.js)
│   └── mcp/             # MCP server (Bun) — wraps @zetesis/mcp-typesense
├── packages/            # 10 publishable @zetesis/* npm packages
├── backend/             # Python uv workspace — agent runtime + workers
├── .devcontainer/       # Dev Container (compose + Dockerfile + LiteLLM config)
├── .vscode/launch.json  # Run & Debug configs (compound "Launch" = full stack)
└── docs/                # Architecture docs & decision records
```

## Commands

```bash
# Dev (Server + MCP) — Python backend runs via Run & Debug "Launch"
pnpm dev

# Build all packages
pnpm build

# Type-check (solution-style)
pnpm tsc --noEmit

# Lint / autofix
pnpm lint
pnpm lint:fix

# Test
pnpm test
```

## Architecture

This is a **pnpm workspaces + Turborepo** monorepo. Packages are compiled in **type isolation** — they don't depend on any app-level `payload-types.ts`, making them truly portable.

Key design decisions are documented in [`docs/architecture/`](docs/architecture/):

- [TypeScript monorepo type isolation](docs/architecture/typescript-monorepo-types.md)
- [Payload cast patterns](docs/architecture/payload-cast-patterns.md)
- [npm publishability](docs/architecture/npm-publishability.md)

## Contributing

- **ESM only** — all packages use `"type": "module"`
- **Biome** for linting and formatting
- **Conventional commits** in English
- **release-please drives releases** — your conventional commits open the release PR automatically (no manual changeset files); the same tool publishes the npm packages and the PyPI backend builders

## License

MIT — see [LICENSE](LICENSE) for details.

---

Built by [Zetesis](https://zetesis.xyz)
