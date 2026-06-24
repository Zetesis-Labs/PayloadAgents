/**
 * Trusted scope logic for mcp-pgvector, kept pure and unit-testable. The
 * security-critical decision of WHAT a request may read lives here, not inline
 * in the HTTP/tool handlers.
 *
 * Two trusted headers (injected by the Payload proxy / forwarded by LiteLLM):
 *   - `x-tenant-slug`    → a HARD tenant boundary (a single slug)
 *   - `x-taxonomy-slugs` → an OPTIONAL content refinement (a slug list)
 * Both are forced as NON-overridable filters — a client cannot widen them.
 */

export interface RequestScope {
  /** Hard tenant boundary; null on a single-tenant deployment. */
  tenant: string | null
  /** Optional taxonomy refinement; empty = the whole (tenant's) corpus. */
  taxonomySlugs: string[]
}

/** Parse the `x-taxonomy-slugs` header into a clean slug list. */
export function parseScopeHeader(raw: string | string[] | undefined): string[] {
  const value = Array.isArray(raw) ? raw.join(',') : raw
  if (!value) return []
  return value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

/** Parse the `x-tenant-slug` header into a single slug (or null). */
export function parseTenantHeader(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw
  const tenant = value?.trim()
  return tenant ? tenant : null
}

/**
 * Force the scope onto a filter as NON-overridable filters — the trusted scope
 * always wins over any client-supplied `tenant` / `taxonomy_slugs`. A null
 * tenant / empty taxonomy leaves that dimension unconstrained (single-tenant
 * deployment / a deliberately broad token). {@link scopeDenied} guards the
 * fully-unscoped case.
 */
export function scopeFilter(filter: Record<string, unknown>, scope: RequestScope): Record<string, unknown> {
  const out: Record<string, unknown> = { ...filter }
  if (scope.tenant) out.tenant = scope.tenant
  if (scope.taxonomySlugs.length > 0) out.taxonomy_slugs = scope.taxonomySlugs
  return out
}

/**
 * Deny-by-default guard. When the server requires a scope and a request carries
 * NONE (no tenant and no taxonomy), it must read nothing rather than the whole
 * corpus. Callers check this before querying and short-circuit to empty.
 */
export function scopeDenied(scope: RequestScope, requireScope: boolean): boolean {
  return requireScope && !scope.tenant && scope.taxonomySlugs.length === 0
}
