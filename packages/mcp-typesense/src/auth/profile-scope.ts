/**
 * Resolve a caller-chosen retrieval profile's scope (filters + lente) onto the
 * base auth context. Two sources, in priority order:
 *
 * 1. **Header-provided** (`auth.groupProfiles[slug]`): the proxy already
 *    resolved the profile and shipped it (token route's `compare_perspectives`).
 * 2. **On-demand resolver** (`resolveProfileScope`): fetch the profile's scope
 *    server-side by slug+tenant. This is the path for callers that send only the
 *    slug — e.g. the Agno agent — so lente weights never cross to the agent.
 *
 * Returns the base auth unchanged when there's no slug, no match, or no resolver.
 *
 * Used by `search_collections` (chosen `retrieval_profile`) and by
 * `compare_perspectives` (per group).
 */

import type { ProfileScopeResolver } from '../retrieval-profile/resolver'
import type { McpAuthContext } from '../types'

export async function applyProfileScope(
  auth: McpAuthContext | null,
  slug: string | undefined,
  resolveProfileScope?: ProfileScopeResolver | null
): Promise<McpAuthContext | null> {
  if (!auth || !slug) return auth

  const fromHeader = auth.groupProfiles?.[slug]
  if (fromHeader) {
    return {
      ...auth,
      taxonomySlugs: fromHeader.taxonomySlugs,
      folderSlugs: fromHeader.folderSlugs,
      retrieval: fromHeader.retrieval
    }
  }

  if (resolveProfileScope && auth.tenantSlug) {
    const scope = await resolveProfileScope(auth.tenantSlug, slug)
    if (scope) {
      return {
        ...auth,
        taxonomySlugs: scope.taxonomySlugs,
        folderSlugs: scope.folderSlugs,
        retrieval: scope.retrieval
      }
    }
  }

  return auth
}
