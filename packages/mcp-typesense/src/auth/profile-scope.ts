/**
 * Resolve a caller-chosen retrieval profile's scope (filters + lente) onto the
 * base auth context. Three sources, in priority order:
 *
 * 1. **Header-provided** (`auth.groupProfiles[slug]`): the proxy already
 *    resolved the profile and shipped it (token route's `compare_perspectives`).
 * 2. **On-demand resolver** (`resolveProfileScope`): fetch the profile's scope
 *    server-side by slug+tenant. The profile document is the source of truth
 *    and the resolver caches per (tenant, slug), so this is the default path —
 *    it is what keeps callers that ship ONLY the slug (the Agno builder for
 *    single-profile agents) scoped, and lente weights never cross to the agent.
 * 3. **Header fallback** (`slug === auth.defaultProfileSlug` AND the request
 *    actually carries scope data): when the resolver is absent or finds
 *    nothing but the proxy demonstrably resolved this same profile into
 *    `x-taxonomy-slugs`/`x-folder-slugs`/retrieval headers, trust those.
 *    A bare slug with no scope alongside is never trusted — treating it as
 *    "already applied" is how the original leak came back.
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

  // Whether the transport headers actually shipped scope data alongside the
  // slug. The web proxy always sends the default profile's filters together
  // with `x-retrieval-profile`; the Agno builder may send the slug ALONE.
  // A bare slug is a reference, not a scope — trusting it unresolved ran the
  // search with no profile filters at all (the original leak, reintroduced).
  const headersCarryScope =
    Boolean(auth.taxonomySlugs?.length) || Boolean(auth.folderSlugs?.length) || auth.retrieval !== undefined

  // Resolver first: the profile document is the source of truth, the resolver
  // caches per (tenant, slug), and this covers callers that ship only the slug.
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

  // Resolver missing or came up empty: accept the request's own scope only
  // when the proxy demonstrably resolved this same profile into headers.
  if (slug === auth.defaultProfileSlug && headersCarryScope) return { ok: true, auth }

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
