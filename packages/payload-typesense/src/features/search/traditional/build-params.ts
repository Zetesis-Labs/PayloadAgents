import {
  DEFAULT_NUM_TYPOS,
  DEFAULT_SEARCH_FIELDS,
  DEFAULT_SNIPPET_THRESHOLD,
  DEFAULT_TYPO_TOKENS_THRESHOLD,
} from "../constants";
import type { TraditionalSearchParams } from "../types";

/**
 * Builds traditional search parameters for a single collection
 */
export const buildTraditionalSearchParams = (
  query: string,
  options: {
    page: number;
    per_page: number;
    searchFields?: string[];
    sort_by?: string;
    exclude_fields?: string;
  },
): TraditionalSearchParams => {
  const {
    page,
    per_page,
    searchFields = DEFAULT_SEARCH_FIELDS,
    sort_by,
    exclude_fields,
  } = options;

  const params: TraditionalSearchParams = {
    highlight_full_fields: searchFields.join(","),
    num_typos: DEFAULT_NUM_TYPOS,
    page,
    per_page,
    q: query,
    query_by: searchFields.join(","),
    snippet_threshold: DEFAULT_SNIPPET_THRESHOLD,
    typo_tokens_threshold: DEFAULT_TYPO_TOKENS_THRESHOLD,
    exclude_fields: exclude_fields,
    sort_by: sort_by,
  };

  return params;
};
