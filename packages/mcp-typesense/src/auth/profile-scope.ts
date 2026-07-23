/**
 * Resolve a caller-chosen retrieval profile's scope (filters + lente) onto the
 * base auth context. Three sources, in priority order:
 *
 * 1. **Header-provided** (`auth.groupProfiles[slug]`): the proxy already
 *    resolved the profile and shipped it (token route's `compare_perspectives`).
 * 2. **Already applied upstream** (`slug === auth.defaultProfileSlug`): whoever
 *    sent `x-retrieval-profile` also sent that profile's resolved scope headers
 *    (`x-taxonomy-slugs`, `x-folder-slugs`, retrieval params), so there is
 *    nothing left to fetch.
 * 3. **On-demand resolver** (`resolveProfileScope`): fetch the profile's scope
 *    server-side by slug+tenant. This is the path for callers that send only the
 *    slug — e.g. the Agno agent picking a non-default profile — so lente weights
 *    never cross to the agent.
 *
 * **Fail closed.** When a slug was chosen and none of the three sources can
 * resolve it, this returns an error instead of the unscoped base auth. Falling
 * back to "no profile" would run the query without the profile's hard filters
 * and return content outside the caller's scope — exactly the failure this
 * guard exists to prevent.
 *
 * Used by `search_collections` (chosen `retrieval_profile`) and by
 * `compare_perspectives` (per group).
 */

import type { ProfileScopeResolver } from '../retrieval-profile/resolver'
import type { McpAuthContext } from '../types'

export interface ProfileScopeError {
  error: 'retrieval_profile_unresolved'
  message: string
  profile: string
}

export type ProfileScopeResult = { ok: true; auth: McpAuthContext | null } | { ok: false; error: ProfileScopeError }

export async function applyProfileScope(
  auth: McpAuthContext | null,
  slug: string | undefined,
  resolveProfileScope?: ProfileScopeResolver | null
): Promise<ProfileScopeResult> {
  if (!auth || !slug) return { ok: true, auth }

  const fromHeader = auth.groupProfiles?.[slug]
  if (fromHeader) {
    return {
      ok: true,
      auth: {
        ...auth,
        taxonomySlugs: fromHeader.taxonomySlugs,
        folderSlugs: fromHeader.folderSlugs,
        retrieval: fromHeader.retrieval
      }
    }
  }

  // The scope headers on this request already describe this very profile.
  if (slug === auth.defaultProfileSlug) return { ok: true, auth }

  if (resolveProfileScope && auth.tenantSlug) {
    const scope = await resolveProfileScope(auth.tenantSlug, slug)
    if (scope) {
      return {
        ok: true,
        auth: {
          ...auth,
          taxonomySlugs: scope.taxonomySlugs,
          folderSlugs: scope.folderSlugs,
          retrieval: scope.retrieval
        }
      }
    }
  }

  return {
    ok: false,
    error: {
      error: 'retrieval_profile_unresolved',
      profile: slug,
      message:
        `Retrieval profile "${slug}" could not be resolved, so the search was NOT executed — ` +
        "running it without the profile's hard filters would return content outside your scope. " +
        'Call list_retrieval_profiles to check the available slugs and retry.'
    }
  }
}
