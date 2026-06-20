/**
 * Tool: compare_perspectives
 *
 * Run the same concept query against N taxonomy-scoped groups in parallel and
 * return the results grouped by name. Each group is just a thin wrapper around
 * `search_collections` with its own `taxonomy_slugs` filter, so all the same
 * rules apply.
 */

import { z } from 'zod'
import type { ToolContext } from '../context'
import type { McpAuthContext } from '../types'
import { searchCollections } from './search-collections'

const DEFAULT_PER_GROUP = 5
const MAX_PER_GROUP = 20
const MAX_GROUPS = 8

export const comparePerspectivesSchema = z.object({
  query: z
    .string()
    .describe('Concept query (1-2 words). Same rules as search_collections — no author names, no meta-words.'),
  groups: z
    .array(
      z.object({
        name: z.string().describe('Display name for this group (e.g., "Mises", "Hayek", "Austrian school").'),
        taxonomy_slugs: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe('Optional taxonomy slug(s) to scope this group (string or string[]).'),
        retrieval_profile: z
          .string()
          .optional()
          .describe(
            "Optional profile slug for THIS group — applies that profile's lente and filters. Lets you compare the SAME query under different lentes (e.g. one group per perspective). Falls back to the top-level retrieval_profile."
          )
      })
    )
    .min(2)
    .max(MAX_GROUPS)
    .describe(
      `2-${MAX_GROUPS} groups to compare. Each group runs as an independent search in parallel, scoped by its taxonomy_slugs and/or its retrieval_profile.`
    ),
  per_group: z
    .number()
    .int()
    .min(1)
    .max(MAX_PER_GROUP)
    .optional()
    .describe(`Hits per group. Default: ${DEFAULT_PER_GROUP}. Max: ${MAX_PER_GROUP}.`),
  mode: z
    .enum(['lexical', 'semantic', 'hybrid'])
    .optional()
    .describe('Search mode applied to all groups. Default: hybrid.'),
  collections: z.array(z.string()).optional().describe('Restrict to specific chunk collections. Defaults to all.'),
  snippet_length: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Truncate chunk_text to N chars. Default: 300. Set to 0 for full text.'),
  expand_context: z
    .number()
    .int()
    .min(0)
    .max(5)
    .optional()
    .describe('Inline neighboring chunks (chunk_index ±N) for each hit. Default: 0. Max: 3.'),
  retrieval_profile: z
    .string()
    .optional()
    .describe(
      'Slug of the retrieval profile to use. Same selection rules as search_collections: required when your token exposes profiles. Call list_retrieval_profiles to see the options.'
    )
})

export type ComparePerspectivesInput = z.infer<typeof comparePerspectivesSchema>

/**
 * Build the auth context a group runs under. When the group names a profile and
 * the proxy resolved it (groupProfiles), apply that profile's filters + lente;
 * otherwise fall back to the request's default auth. This is what lets two
 * groups run the same query under different lentes.
 */
function authForGroup(auth: McpAuthContext | null, slug: string | undefined): McpAuthContext | null {
  if (!auth || !slug) return auth
  const gp = auth.groupProfiles?.[slug]
  if (!gp) return auth
  return { ...auth, taxonomySlugs: gp.taxonomySlugs, folderSlugs: gp.folderSlugs, retrieval: gp.retrieval }
}

export async function comparePerspectives(
  input: ComparePerspectivesInput,
  ctx: ToolContext,
  auth: McpAuthContext | null
) {
  const perGroup = input.per_group ?? DEFAULT_PER_GROUP
  const start = Date.now()

  const groupResults = await Promise.all(
    input.groups.map(async g => {
      const filters = g.taxonomy_slugs ? { taxonomy_slugs: g.taxonomy_slugs } : undefined
      const groupAuth = authForGroup(auth, g.retrieval_profile ?? input.retrieval_profile)

      const result = await searchCollections(
        {
          query: input.query,
          filters,
          per_page: perGroup,
          mode: input.mode,
          collections: input.collections,
          snippet_length: input.snippet_length,
          expand_context: input.expand_context
        },
        ctx,
        groupAuth
      )

      return {
        name: g.name,
        taxonomy_slugs: g.taxonomy_slugs,
        retrieval_profile: g.retrieval_profile ?? input.retrieval_profile,
        total_found: result.total_found,
        hits: result.hits
      }
    })
  )

  return {
    query: input.query,
    mode: input.mode ?? 'hybrid',
    per_group: perGroup,
    groups: groupResults,
    search_time_ms: Date.now() - start
  }
}
