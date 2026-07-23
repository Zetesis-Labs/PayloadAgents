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
  error: 'retrieval_profile_unresolved' | 'retrieval_profile_forbidden'
  message: string
  profile: string
}

export type ProfileScopeResult = { ok: true; auth: McpAuthContext | null } | { ok: false; error: ProfileScopeError }

/**
 * The profiles a caller was actually granted: its catalog (`availableProfiles`,
 * sent for multi-profile callers), its default (`defaultProfileSlug`, the single
 * profile the proxy/builder attached), and any profile the proxy pre-resolved
 * for THIS request (`groupProfiles`, compare_perspectives). A caller with none
 * of these is an unscoped legacy token.
 */
export function profileGrantedSet(auth: McpAuthContext | null): Set<string> {
  const granted = new Set<string>((auth?.availableProfiles ?? []).map(p => p.slug))
  if (auth?.defaultProfileSlug) granted.add(auth.defaultProfileSlug)
  for (const slug of Object.keys(auth?.groupProfiles ?? {})) granted.add(slug)
  return granted
}

/** Whether the caller may search/read under `slug`. Open (unscoped) tokens may use any. */
export function isProfileGranted(auth: McpAuthContext | null, slug: string): boolean {
  const granted = profileGrantedSet(auth)
  return granted.size === 0 || granted.has(slug)
}

export async function applyProfileScope(
  auth: McpAuthContext | null,
  slug: string | undefined,
  resolveProfileScope?: ProfileScopeResolver | null
): Promise<ProfileScopeResult> {
  if (!auth || !slug) return { ok: true, auth }

  // Authorization gate. `applyProfileScope` is the single chokepoint every
  // caller-chosen slug flows through — search, compare, AND the read tools — so
  // rejecting an ungranted slug here closes cross-profile access everywhere at
  // once, before the resolver would fetch another profile's scope by slug.
  if (!isProfileGranted(auth, slug)) {
    return {
      ok: false,
      error: {
        error: 'retrieval_profile_forbidden',
        profile: slug,
        message: `You are not authorized to use retrieval_profile "${slug}". Use one of the profiles available to you.`
      }
    }
  }

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
