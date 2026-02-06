import type { TableConfig } from "@nexo-labs/payload-indexer";
import type { CollectionSlug } from "payload";
import type {
  EmbeddingProviderConfig,
  RAGFeatureConfig,
  TypesenseConnectionConfig,
} from "../../shared/types/plugin-types";

// --- Search Feature Config ---

export type SearchMode = "semantic" | "keyword" | "hybrid";

export interface SearchDefaults {
  mode?: SearchMode;
  perPage?: number;
  tables?: string[];
}

export interface SearchFeatureConfig {
  enabled: boolean;
  defaults?: SearchDefaults;
}

// --- Sync Feature Config ---

export interface SyncFeatureConfig {
  enabled: boolean;
  autoSync?: boolean;
  batchSize?: number;
}

// --- Main Configuration ---

export interface FeatureFlags {
  embedding?: EmbeddingProviderConfig;
  search?: SearchFeatureConfig;
  rag?: RAGFeatureConfig;
  sync?: SyncFeatureConfig;
}

export interface ModularPluginConfig {
  typesense: TypesenseConnectionConfig;
  features: FeatureFlags;
  collections: Record<CollectionSlug | string, TableConfig[]>;
}
