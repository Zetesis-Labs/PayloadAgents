/**
 * Agent Loader Service
 * Loads RAG agents from PayloadCMS database
 */

import type { Payload } from 'payload'
import type { AgentConfig } from '@nexo-labs/payload-typesense'
import type { Agent, Media, Taxonomy } from '@/payload-types'

/**
 * Load agents from PayloadCMS database
 */
export async function loadAgentsFromPayload(payload: Payload): Promise<AgentConfig[]> {
  try {
    const { docs } = await payload.find({
      collection: 'agents',
      where: { isActive: { equals: true } },
      depth: 1,
      limit: 100,
    })

    return docs.map(toAgentConfig)
  } catch (error) {
    console.warn('Could not load agents from Payload:', error)
    return []
  }
}

/**
 * Convert Payload Agent to AgentConfig
 */
function toAgentConfig(agent: Agent): AgentConfig {
  return {
    slug: agent.slug,
    name: agent.name,
    systemPrompt: agent.systemPrompt,
    llmModel: agent.llmModel,
    searchCollections: agent.searchCollections || ['posts_chunk'],
    kResults: agent.kResults ?? 5,
    apiKey: agent.apiKey,
    maxContextBytes: agent.maxContextBytes ?? 65536,
    ttl: agent.ttl ?? 86400,
    avatar: extractAvatarUrl(agent.avatar),
    welcomeTitle: agent.welcomeTitle ?? undefined,
    welcomeSubtitle: agent.welcomeSubtitle ?? undefined,
    suggestedQuestions: agent.suggestedQuestions?.map((q) => ({
      prompt: q.prompt,
      title: q.title,
      description: q.description || '',
    })),
    taxonomySlugs: extractTaxonomySlugs(agent.taxonomies),
  }
}

/**
 * Extract avatar URL from Media object or return undefined
 * Prefers the optimized 'avatar' size if available
 */
function extractAvatarUrl(avatar?: number | Media | null): string | undefined {
  if (!avatar || typeof avatar !== 'object') return undefined

  const avatarSize = avatar.sizes?.avatar?.url
  if (avatarSize) return avatarSize

  return avatar.url ?? undefined
}

/**
 * Extract taxonomy slugs from the taxonomies relationship
 */
function extractTaxonomySlugs(taxonomies?: (number | Taxonomy)[] | null): string[] {
  if (!taxonomies) return []

  return taxonomies
    .filter((t): t is Taxonomy => typeof t === 'object')
    .map((t) => t.slug)
}
