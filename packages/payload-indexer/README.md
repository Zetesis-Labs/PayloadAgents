# @zetesis/payload-indexer

Generic document indexing library for Payload CMS with support for multiple search backends, embedding providers, and chunking strategies.

## Installation

```bash
pnpm add @zetesis/payload-indexer
```

## Usage

```ts
import { createIndexerPlugin, OpenAIEmbeddingProvider } from '@zetesis/payload-indexer'

const indexerPlugin = createIndexerPlugin({
  collections: ['posts', 'pages'],
  adapter: mySearchAdapter,
  embedding: {
    provider: new OpenAIEmbeddingProvider({ apiKey: process.env.OPENAI_API_KEY }),
  },
})
```

## Entry Points

| Subpath | Description |
|---------|-------------|
| `.` | Main entry -- plugin factory, adapters, embedding, chunking, sync status services |
| `./client` | Client components for Payload admin UI (`SyncStatusCell`, `SyncStatusField`) |

## Exports

### Main (`@zetesis/payload-indexer`)

- **`createIndexerPlugin`** - Main plugin factory for Payload CMS
- **`IndexerAdapter`** - Abstract adapter interface for search backends
- **`OpenAIEmbeddingProvider`** / **`GeminiEmbeddingProvider`** - Embedding providers
- **`createEmbeddingService`** - Embedding service factory
- **`chunkMarkdown`** / **`chunkText`** - Text chunking strategies
- **`mapPayloadDocumentToIndex`** - Document mapping utilities
- **`DocumentSyncer`** - Sync utilities for document indexing
- **`Logger`** / **`createLogger`** - Configurable logging system
- **`createSyncStatusEndpoints`** - REST endpoints for sync status checks
- **`checkSyncStatus`** / **`checkBatchSyncStatus`** - Sync status comparison services

### Client (`@zetesis/payload-indexer/client`)

- **`SyncStatusCell`** - List view cell component showing sync status as a colored Pill
- **`SyncStatusField`** - Sidebar field component with status display and manual "Sync Now" button

## Architecture

### Key Classes

| Class / Function | File | Role |
|-----------------|------|------|
| `DocumentSyncer` | `src/plugin/sync/document-syncer.ts` | Orchestrates the full sync lifecycle: field mapping, chunking, embedding, and adapter upsert |
| `EmbeddingService` | `src/embedding/` | Batch embedding generation via OpenAI or Gemini providers |
| `createAfterChangeHook` | `src/plugin/sync/hooks.ts` | Payload lifecycle hook that triggers sync on document save |
| `createAfterDeleteHook` | `src/plugin/sync/hooks.ts` | Payload lifecycle hook that triggers deletion from the index |
| `checkSyncStatus` | `src/sync-status/sync-status-service.ts` | Compares SHA-256 content hashes between Payload and the index |
| `mapPayloadDocumentToIndex` | `src/document/field-mapper.ts` | Maps Payload document fields to the indexable schema |

### Sync Execution Flow

```
afterChange hook
  -> processTableConfigAfterChange
    -> DocumentSyncer.syncChunked
      -> mapPayloadDocumentToIndex (field mapping)
      -> chunkMarkdown / chunkText (chunking strategies)
      -> EmbeddingService.getEmbedding (OpenAI / Gemini)
      -> adapter.upsertDocument (backend-specific)
```

### Text Extraction Pipeline

For Lexical rich text fields, the plugin extracts plain text for indexing:

```
createSummarizeLexicalTransform
  -> extractLinkNodeText / extractHeadingNodeText / extractQuoteNodeText
```

## Features

- Multi-backend adapter pattern (Typesense, Algolia, or custom)
- Embedding providers for OpenAI and Google Gemini with batch processing
- Smart chunking for markdown and plain text with configurable size/overlap
- Automatic sync via Payload hooks (`afterChange`, `afterDelete`)
- Lexical editor content to markdown transformation
- Vector search with semantic embeddings
- Type-safe with full TypeScript support and schema inference
- **Sync status virtual field** -- automatically injected into indexed collections showing whether each document is synced, outdated, or not indexed
- **Manual sync trigger** -- "Sync Now" button in the document sidebar to re-index a single document on demand

### Sync Status

When `features.sync.enabled` is `true`, the plugin automatically:

1. **Injects a `_syncStatus_<adapter>` virtual field** into every indexed collection (namespaced by `adapter.name`, e.g. `_syncStatus_typesense`, so multiple adapters can index the same collection in parallel). This field appears in the admin sidebar and list view.
2. **Registers REST endpoints** for sync status checks (also namespaced by adapter, e.g. `/api/sync-status-typesense`):
   - `GET /api/sync-status-<adapter>/:collection` -- Batch check all documents in a collection (supports `page`, `limit`, `ids`, `where` params)
   - `GET /api/sync-status-<adapter>/:collection/:id` -- Check a single document
   - `POST /api/sync-status-<adapter>/:collection/:id/sync` -- Trigger re-indexing of a single document

The sync status is computed by comparing content hashes (SHA-256) between the Payload document and its indexed counterpart. Possible values: `synced`, `outdated`, `not-indexed`, `error`.

## Peer Dependencies

- `payload` ^3.75.0
- `@payloadcms/richtext-lexical` ^3.75.0 (optional)
- `@payloadcms/ui` ^3.75.0 (optional -- needed for client components)
- `react` ^19.0.0 (optional -- needed for client components)

## License

MIT
