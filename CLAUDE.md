# CLAUDE.md

## Project

TypeScript monorepo (pnpm workspaces + Turborepo) with 10 publishable npm packages under `@zetesis/` plus a Python backend (uv workspace) for the agent runtime and workers.

Open-source Payload CMS plugins extracted from ZetesisPortal.

## Type Isolation Architecture

Packages are compiled **isolated** from any app-level `payload-types.ts`. Inside packages, `CollectionSlug` resolves to `string`, not to an app's union type. Isolation is achieved with:

- `tsconfig.base.json` with `paths: {}` (intentionally empty)
- Project references to declare dependencies between packages
- `package.json` exports as the sole resolution mechanism

> Detail: [docs/architecture/typescript-monorepo-types.md](docs/architecture/typescript-monorepo-types.md)

## Cast Patterns

- Queries (`payload.find`): `as unknown as LocalInterface`
- Writes (`payload.create/update`): `as Record<string, unknown>`
- JSON boundaries: `JSON.parse() as Type`
- CSS custom properties: `as React.CSSProperties`
- Literals: `as const`

**Prohibited:**
- `as any` -- always use a typed alternative
- `eslint-disable` / `biome-ignore` to suppress type errors
- Generics `<T extends CollectionSlug>` or `<TConfig extends Config>` in isolated packages

> Detail: [docs/architecture/payload-cast-patterns.md](docs/architecture/payload-cast-patterns.md)

## npm Publishing

- Dual exports: `types->dist`, `import->src` (dev) / all->dist (npm via `publishConfig`)
- tsdown with `dts: { resolve: true }` for self-contained declarations
- **release-please** drives versioning + npm/PyPI publish from conventional commits (no manual `.changeset/*.md`). Same tool covers npm packages and the Python builders under `backend/`.
- `sideEffects: false` where applicable

> Detail: [docs/architecture/npm-publishability.md](docs/architecture/npm-publishability.md)

## Type Audit

To audit types of a package, follow the playbook manually.

> Playbook: [docs/architecture/type-audit-playbook.md](docs/architecture/type-audit-playbook.md)

## Packages

### npm packages (`packages/*`)

| Package | Entry points | Internal deps |
|---------|-------------|---------------|
| `payload-indexer` | `.` `.client` | -- |
| `payload-typesense` | `.` | payload-indexer |
| `payload-taxonomies` | `.` `.constants` | -- |
| `payload-lexical-blocks-builder` | `.` `.builder` `.renderer` | -- |
| `payload-agents-core` | `.` `.client` | -- |
| `payload-agents-metrics` | `.` `.client` | agent-ui, payload-agents-core |
| `payload-documents` | `.` `.client` | nexus-queue |
| `agent-ui` | `.` `.styles.css` | -- |
| `mcp-typesense` | `.` | -- |
| `nexus-queue` | `.` | -- |

### Apps (`apps/*`, private)

- `server` -- Payload CMS playground (Next.js)
- `mcp` -- MCP server (Bun), wraps `@zetesis/mcp-typesense`

### Python backend (`backend/*`, uv workspace)

- `agno-agent-builder` / `agno-agent` -- Agno agent runtime (routed through the LiteLLM gateway)
- `nexus-queue` -- Taskiq + Redis Streams worker base
- `payload-documents-worker-builder` / `payload-documents-worker` -- LlamaParse PDF parser

## Commands

```bash
# Build a package
pnpm --filter @zetesis/{pkg} build

# Type-check global (solution-style)
pnpm tsc --noEmit

# Build all packages
pnpm build

# Lint
pnpm lint

# Lint with autofix
pnpm lint:fix

# Test
pnpm test
```

## Conventions

- **No git without explicit instruction** -- NEVER run git commands (commit, add, push, checkout, branch, tag, etc.) or create PRs unless the user explicitly asks.
- **ESM only** -- `"type": "module"` in all packages
- **Biome** for linting and formatting (not ESLint, not Prettier)
- **Conventional commits** in English
- **No `as any`** -- always use a typed alternative
- **No `eslint-disable` / `biome-ignore`** -- fix the cause, not the symptom
- **pnpm** as package manager (v10)
- **Node 24** (matches CI; the Dev Container ships it). `engines` allow 22–25.
- **Conventional commits drive releases** -- release-please opens/updates a release PR (`chore(main): release ...`) automatically. No manual `.changeset/*.md` files.

  **Valid scopes** (must match `component` in `release-please-config.json`):

  | Scope | Path | Tag |
  |---|---|---|
  | `agent-ui` | `packages/agent-ui` | `agent-ui-v*` |
  | `mcp-typesense` | `packages/mcp-typesense` | `mcp-typesense-v*` |
  | `nexus-queue-ts` | `packages/nexus-queue` | `nexus-queue-ts-v*` |
  | `payload-agents-core` | `packages/payload-agents-core` | `payload-agents-core-v*` |
  | `payload-agents-metrics` | `packages/payload-agents-metrics` | `payload-agents-metrics-v*` |
  | `payload-documents` | `packages/payload-documents` | `payload-documents-v*` |
  | `payload-indexer` | `packages/payload-indexer` | `payload-indexer-v*` |
  | `payload-lexical-blocks-builder` | `packages/payload-lexical-blocks-builder` | `payload-lexical-blocks-builder-v*` |
  | `payload-taxonomies` | `packages/payload-taxonomies` | `payload-taxonomies-v*` |
  | `payload-typesense` | `packages/payload-typesense` | `payload-typesense-v*` |
  | `agno-agent-builder` | `backend/agno-agent-builder` | `agno-agent-builder-v*` |
  | `nexus-queue` | `backend/nexus-queue` | `nexus-queue-v*` |
  | `payload-documents-worker-builder` | `backend/payload-documents-worker-builder` | `payload-documents-worker-builder-v*` |

  **Bump rules**:
  - `feat(scope): ...` → minor
  - `fix(scope): ...` → patch
  - `feat(scope)!: ...` or footer `BREAKING CHANGE:` → major
  - `chore:`, `docs:`, `style:`, `refactor:`, `test:`, `ci:` → no bump
  - `node-workspace` plugin cascades patches: bumping `payload-indexer` auto-patches `payload-typesense`; bumping `agent-ui` or `payload-agents-core` auto-patches `payload-agents-metrics`.

  **Multi-component changes**: write separate commits (one per scope), or a single commit with bullets in the body:
  ```
  feat: add chunking strategy across stack

  * feat(payload-indexer): expose chunkStrategy field
  * feat(payload-typesense): pass chunkStrategy to schema
  ```

## Self-correction workflow

After each significant change (new file, refactor, type change), run:

```bash
pnpm lint && pnpm tsc --noEmit
```

Fix errors immediately before continuing with the next change.
