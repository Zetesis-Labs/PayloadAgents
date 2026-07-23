/**
 * Enforce the caller's scope (tenant + the chosen profile's hard filters) over
 * the filters the caller asked for.
 *
 * The scope is a **ceiling, not a default**: caller-supplied `taxonomy_slugs` /
 * `folder_slugs` may only narrow *within* what the profile allows, and `tenant`
 * is never negotiable. Previously the auth-derived filters were applied only
 * when the caller left the field empty, so any agent that passed
 * `filters.taxonomy_slugs` (which the server instructions actively encourage)
 * silently replaced its profile's hard filters — and `filters.tenant` let a
 * caller read another tenant's content.
 *
 * Fields the scope says nothing about (`headers`, …) pass through untouched.
 */

import type { McpAuthContext } from '../types'

export type FilterMap = Record<string, string | string[]>

export interface ScopedFilterResult {
  /** Filters to send to Typesense, with the scope enforced. */
  filters: FilterMap | undefined
  /** What the scope changed about the request, surfaced back to the agent. */
  notices: string[]
  /** The caller asked exclusively for values outside its scope — nothing can match. */
  outOfScope: boolean
}

/** Scope-governed filter fields and the auth key holding their allow-list. */
const SCOPED_FIELDS = [
  { field: 'taxonomy_slugs', key: 'taxonomySlugs' },
  { field: 'folder_slugs', key: 'folderSlugs' }
] as const

const toList = (value: string | string[]): string[] => (Array.isArray(value) ? value : [value])

/** Typesense filters read better as a scalar when there is a single value. */
const collapse = (slugs: string[]): string | string[] => (slugs.length === 1 ? (slugs[0] as string) : slugs)

/** One Typesense clause per filter entry. Arrays become an OR set, scalars an exact match. */
export function buildFilterString(filters: FilterMap): string {
  return Object.entries(filters)
    .map(([key, value]) => (Array.isArray(value) ? `${key}:[${value.join(',')}]` : `${key}:=${value}`))
    .join(' && ')
}

/**
 * The caller's scope as standalone Typesense clauses, ready to `&&` into any
 * query. Read tools (`get_chunks_by_ids`, `get_chunks_by_parent`, …) use this
 * to stay inside the same boundary `search_collections` enforces — otherwise
 * an agent could search within its profile and then read outside it by id.
 */
export function scopeFilterClauses(auth: McpAuthContext | null): string[] {
  const scoped = applyScopeToFilters(undefined, auth)
  return scoped.filters ? Object.entries(scoped.filters).map(([k, v]) => buildFilterString({ [k]: v })) : []
}

export function applyScopeToFilters(requested: FilterMap | undefined, auth: McpAuthContext | null): ScopedFilterResult {
  const filters: FilterMap = { ...requested }
  const notices: string[] = []
  let outOfScope = false

  // Tenant is set by the credentials, never by the request.
  if (auth?.tenantSlug) {
    const asked = filters.tenant
    if (asked !== undefined && toList(asked).some(t => t !== auth.tenantSlug)) {
      notices.push(`\`tenant\` is fixed to "${auth.tenantSlug}" by your credentials; the value you passed was ignored.`)
    }
    filters.tenant = auth.tenantSlug
  }

  for (const { field, key } of SCOPED_FIELDS) {
    const allowed = auth?.[key]
    if (!allowed?.length) continue

    const asked = filters[field]
    if (asked === undefined) {
      filters[field] = collapse(allowed)
      continue
    }

    const askedList = toList(asked)
    const kept = askedList.filter(slug => allowed.includes(slug))
    const dropped = askedList.filter(slug => !allowed.includes(slug))

    if (kept.length === 0) {
      // Nothing the caller asked for is inside the scope. Keep the scope's own
      // filter (never the caller's) and let the tool short-circuit.
      filters[field] = collapse(allowed)
      outOfScope = true
      notices.push(
        `Your retrieval profile restricts \`${field}\` to [${allowed.join(', ')}]. ` +
          `You asked for [${askedList.join(', ')}], which is entirely outside it — no results. ` +
          'Search within the profile scope, or pick a different `retrieval_profile`.'
      )
      continue
    }

    filters[field] = collapse(kept)
    if (dropped.length > 0) {
      notices.push(
        `\`${field}\` was narrowed to [${kept.join(', ')}]: ` +
          `[${dropped.join(', ')}] is outside your retrieval profile's scope.`
      )
    }
  }

  return {
    filters: Object.keys(filters).length > 0 ? filters : undefined,
    notices,
    outOfScope
  }
}
