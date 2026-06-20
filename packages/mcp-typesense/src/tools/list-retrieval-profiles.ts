/**
 * Tool: list_retrieval_profiles
 * Returns the retrieval profiles available to the caller's token, so the agent
 * can decide which one to pass as `retrieval_profile` to the search tool. The
 * catalog is metadata only (slug/name/description) — the proxy resolves the
 * chosen profile's actual filters, hybrid params, reranker and lente.
 */

import { z } from 'zod'
import type { McpAuthContext } from '../types'

export const listRetrievalProfilesSchema = z.object({})

export type ListRetrievalProfilesInput = z.infer<typeof listRetrievalProfilesSchema>

interface RetrievalProfileInfo {
  slug: string
  name: string
  description: string
}

export interface ListRetrievalProfilesResult {
  /** The first profile is the default applied when `retrieval_profile` is omitted. */
  profiles: RetrievalProfileInfo[]
}

export function listRetrievalProfiles(
  _input: ListRetrievalProfilesInput,
  auth: McpAuthContext | null
): ListRetrievalProfilesResult {
  return { profiles: auth?.availableProfiles ?? [] }
}
