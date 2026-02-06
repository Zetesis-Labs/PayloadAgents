import type { TableConfig } from "@nexo-labs/payload-indexer";
import { SearchResponse } from "typesense/lib/Typesense/Documents";
import type {
  CollectionSearchResult,
  CombinedSearchResult,
  SearchHit,
} from "../types";

/**
 * Processes traditional search results from a single collection
 */
export const processSingleCollectionTraditionalResults = (
  results: SearchResponse<object>,
  collectionName: string,
  config: TableConfig,
): CollectionSearchResult => {
  return {
    collection: collectionName,
    displayName: config?.displayName || collectionName,
    icon: "📄",
    found: results.found,
    hits:
      results.hits?.map(
        (hit): SearchHit => ({
          ...hit,
          collection: collectionName,
          displayName: config?.displayName || collectionName,
          icon: "📄",
          document: (hit.document || {}) as Record<string, unknown>,
        }),
      ) || [],
  };
};

/**
 * Combines traditional search results from multiple collections
 */
export const combineTraditionalResults = (
  results: CollectionSearchResult[],
  options: {
    page: number;
    per_page: number;
    query: string;
  },
): CombinedSearchResult => {
  const { page, per_page, query } = options;

  const combinedHits = results.flatMap((result) => result.hits || []);
  const totalFound = results.reduce(
    (sum, result) => sum + (result.found || 0),
    0,
  );

  // Sort by text match score
  combinedHits.sort((a, b) => (b.text_match || 0) - (a.text_match || 0));

  const searchResult: CombinedSearchResult = {
    collections: results.map((r) => ({
      collection: r.collection,
      displayName: r.displayName,
      error: r.error,
      found: r.found || 0,
      icon: r.icon,
    })),
    found: totalFound,
    hits: combinedHits.slice(0, per_page),
    page,
    request_params: { per_page, query },
    search_cutoff: false,
    search_time_ms: 0,
  };

  return searchResult;
};
