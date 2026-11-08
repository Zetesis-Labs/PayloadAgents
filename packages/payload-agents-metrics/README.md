# @zetesis/payload-agents-metrics

LLM usage observability plugin for Payload CMS: token tracking, cost calculation, session analytics, and a ready-to-use dashboard component. Designed to plug into `@zetesis/payload-agents-core` via its `onRunCompleted` hook.

## Installation

```bash
pnpm add @zetesis/payload-agents-metrics
```

## Usage

```ts
import { agentPlugin } from '@zetesis/payload-agents-core'
import { metricsPlugin } from '@zetesis/payload-agents-metrics'
import { buildConfig } from 'payload'

const metrics = metricsPlugin({
  // Set to `true` and provide `checkAccess` + `resolveTenantId` for multi-tenant setups.
  multiTenant: false
})

export default buildConfig({
  plugins: [
    agentPlugin({
      // ...existing options
      onRunCompleted: metrics.onRunCompleted
    }),
    metrics
  ]
})
```

Renders the dashboard anywhere in your Payload admin (or any React app):

```tsx
'use client'
import { LlmUsageDashboard } from '@zetesis/payload-agents-metrics/client'

export default function Page() {
  return <LlmUsageDashboard basePath="/api/metrics" />
}
```

## Entry Points

| Subpath | Description |
|---------|-------------|
| `.` | Plugin factory, hook factory, collection, endpoints, query/pricing helpers |
| `./client` | `<LlmUsageDashboard />` React component and related types |

## Exports

### Main (`@zetesis/payload-agents-metrics`)

- **`metricsPlugin`** — Plugin factory. Returns a `Plugin` with an extra `onRunCompleted` property ready to wire into `agentPlugin`.
- **`createOnRunCompleted`** — Lower-level factory if you need to build the hook manually.
- **`calculateLlmCost`** / **`normalizeProvider`** — Pricing utilities, extensible via `extraPricing`.
- **Types**: `MetricsPluginConfig`, `ResolvedMetricsConfig`, `AccessResult`, `AggregateFilters`, `BucketRow`, `SeriesRow`, `Totals`, `SessionFilters`, `SessionRow`, `SessionsResult`, `SessionTotals`, `GroupBy`.

### Client (`@zetesis/payload-agents-metrics/client`)

- **`LlmUsageDashboard`** — Filter-aware dashboard with KPI cards, day series, top-by-cost chart, per-dimension bucket table, and a sessions side panel.
- **Types**: `LlmUsageDashboardProps`, `BucketRow`, `SeriesRow`, `SessionRow`, `GroupBy`.

## Architecture

### What the plugin installs

- **Collection** `llm-usage-events`: one row per completed run, indexed by `completedAt`, `user`, `agent`, `model`, `provider`, `apiKeySource`, `conversationId`. Read-only from the admin UI.
- **Endpoints** under `{basePath}` (default `/metrics`):
  - `GET /aggregate` — totals, paginated buckets, top-by-cost, day series.
  - `POST /ingest` — authenticated batch ingest (1–100 events).
  - `GET /sessions` — conversation list with per-session totals.
  - `GET /session` — conversation detail, pulling the full transcript from `agno.agno_runs`.

### Data flow

```
Agent runs a model
    -> agent-runtime emits SSE
    -> @zetesis/payload-agents-core captures `RunCompleted`
    -> metrics `onRunCompleted` creates an llm-usage-events row
    -> /metrics/* endpoints read and aggregate
    -> <LlmUsageDashboard /> renders
```

### Security model

- The collection is **read-only** from the admin; writes happen only via the
  hook or `/ingest` with `x-internal-secret`.
- In multi-tenant mode, reads are scoped to the tenants returned by
  `checkAccess`. The plugin uses the multi-tenant Payload plugin convention:
  the `tenant` relationship is injected externally by your multi-tenant
  plugin, not by this one.
- `conversationId` → session detail is double-checked: a tenant-scoped
  user must own at least one event for the requested conversation before
  the plugin exposes the Agno transcript.

## Configuration

Full shape lives in `MetricsPluginConfig` but the common options are:

| Option | Default | Purpose |
|--------|---------|---------|
| `multiTenant` | `true` | Whether to scope everything by tenant. When `false`, the collection has no `tenant` field and endpoints skip tenant filters. |
| `checkAccess` | `() => ({ allTenants: true })` | Decide what the current user can read. Required when `multiTenant` is `true`. |
| `resolveTenantId` | `() => null` | Resolve the tenant id for a user when persisting an event. Required when `multiTenant` is `true`. |
| `basePath` | `'/metrics'` | Endpoint prefix. |
| `ingestSecret` | `process.env.AGNO_INTERNAL_SECRET ?? 'dev'` | Shared secret required by `POST /ingest`. |
| `collectionSlug` | `'llm-usage-events'` | Override the Payload collection slug. |
| `extraPricing` | `{}` | Extend or override the built-in model price table. |
| `agnoRunsTable` | `'agno.agno_runs'` | Fully-qualified Agno runs table (Agno >= 3) used by session detail and first-message previews. |

## Cost calculation

Model prices live in `src/lib/cost-calculator.ts` as USD per token. The
plugin applies the table server-side on every event (unless the caller
passes a pre-computed `costUsd` to `/ingest`). To price custom or
fine-tuned models, pass an `extraPricing` map that is merged over the
built-in table:

```ts
metricsPlugin({
  extraPricing: {
    'my-fine-tune': { input: 1 / 1_000_000, output: 3 / 1_000_000 }
  }
})
```

Unknown models log a warning and record `costUsd: 0`.

## License

MIT
