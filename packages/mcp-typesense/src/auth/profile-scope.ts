/**
 * Resolve a caller-chosen retrieval profile's scope from the request's
 * group-profile catalog.
 *
 * When the caller selected a profile by slug AND the upstream forwarded that
 * profile's fully-resolved config in `groupProfiles`, return an auth context
 * with that profile's filters + lente applied on top of the base auth.
 * Otherwise return the auth unchanged.
 *
 * Two callers rely on this:
 * - `compare_perspectives` applies it per group, so each group can run the same
 *   query under a different lente.
 * - `search_collections` applies it to the chosen `retrieval_profile`. This is
 *   what lets the Agno agent — which receives the FULL profile catalog as fixed
 *   connection headers, not a per-request proxy resolution — pick a lente per
 *   query. The single-profile token route doesn't send `groupProfiles` for
 *   search, so this is a no-op there (the proxy already resolved the chosen
 *   profile into `retrieval`).
 */

import type { McpAuthContext } from '../types'

export function applyProfileScope(auth: McpAuthContext | null, slug: string | undefined): McpAuthContext | null {
  if (!auth || !slug) return auth
  const scope = auth.groupProfiles?.[slug]
  if (!scope) return auth
  return { ...auth, taxonomySlugs: scope.taxonomySlugs, folderSlugs: scope.folderSlugs, retrieval: scope.retrieval }
}
