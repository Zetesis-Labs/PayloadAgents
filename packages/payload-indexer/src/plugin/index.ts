/**
 * Plugin module exports
 */

// Main factory
export { createIndexerPlugin } from "./create-indexer-plugin";
export type { IndexerPluginResult } from "./create-indexer-plugin";

// Types
export type {
  IndexerFeatureConfig,
  IndexerPluginConfig,
  SearchFeatureConfig,
  SearchMode,
  SyncFeatureConfig,
} from "./types";

// Sync utilities (for custom implementations)
export {
  DocumentSyncer,
  applySyncHooks,
  deleteDocumentFromIndex,
  syncDocumentToIndex,
} from "./sync";

// Naming utilities
export { getIndexCollectionName } from "./utils";
