/**
 * Trusted taxonomy-scope logic for mcp-pgvector, kept pure and unit-testable.
 *
 * The security-critical decision of WHAT a request may read lives here, not
 * inline in the HTTP/tool handlers. The scope arrives via the trusted
 * `x-taxonomy-slugs` header (injected by the Payload proxy / forwarded by
 * LiteLLM); a client cannot widen it.
 */

/** Parse the `x-taxonomy-slugs` header into a clean slug list. */
export function parseScopeHeader(raw: string | string[] | undefined): string[] {
  const value = Array.isArray(raw) ? raw.join(',') : raw
  if (!value) return []
  return value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

/**
 * Force the scope onto a filter as a NON-overridable `taxonomy_slugs` filter —
 * the scope always wins over any client-supplied `taxonomy_slugs`. With no
 * scope the filter is returned unchanged (see {@link scopeDenied} for the
 * deny-by-default guard that must gate this case).
 */
export function scopeFilter(filter: Record<string, unknown>, scope: string[]): Record<string, unknown> {
  return scope.length > 0 ? { ...filter, taxonomy_slugs: scope } : filter
}

/**
 * Deny-by-default guard. When the server is configured to require a scope and a
 * request carries none, it must read NOTHING rather than the whole corpus.
 * Callers check this before querying and short-circuit to an empty result.
 */
export function scopeDenied(scope: string[], requireScope: boolean): boolean {
  return requireScope && scope.length === 0
}
