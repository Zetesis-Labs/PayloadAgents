import {
  DEFAULT_ALPHA,
  DEFAULT_K,
  DEFAULT_PAGE,
  DEFAULT_PER_PAGE,
  DEFAULT_SEARCH_FIELDS,
} from "../constants";
import type { BuildVectorSearchParamsOptions } from "../types";

/**
 * Builds vector search parameters for a single collection
 */
export const buildVectorSearchParams = (
  searchVector: number[],
  options: BuildVectorSearchParamsOptions,
): Record<string, unknown> => {
  const {
    query,
    k = DEFAULT_K,
    hybrid = false,
    alpha = DEFAULT_ALPHA,
    page = DEFAULT_PAGE,
    per_page = DEFAULT_PER_PAGE,
    filter_by,
    sort_by,
    searchFields,
  } = options;

  const searchParams: Record<string, unknown> = {
    q: "*", // Required by Typesense, use wildcard for pure vector search
    vector_query: `embedding:([${searchVector.join(",")}], k:${k})`,
    per_page,
    page,
    exclude_fields: "embedding",
  };

  // Add keyword search if hybrid mode
  if (hybrid && query) {
    searchParams.q = query;
    searchParams.query_by =
      searchFields?.join(",") || DEFAULT_SEARCH_FIELDS.join(",");
    searchParams.vector_query = `embedding:([${searchVector.join(",")}], k:${k}, alpha:${alpha})`;
  }

  // Add filters if provided
  if (filter_by) {
    searchParams.filter_by = filter_by;
  }

  // Add sorting if provided
  if (sort_by) {
    searchParams.sort_by = sort_by;
  }

  return searchParams;
};
