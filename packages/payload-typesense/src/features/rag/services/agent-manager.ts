import type { Client } from 'typesense'
import type { NodeConfiguration } from 'typesense/lib/Typesense/Configuration'
import { logger } from '../../../core/logging/logger'
import type { AgentConfig } from '../../../shared/types/plugin-types'
import { ensureConversationCollection } from '../setup'

/**
 * Configuration for AgentManager
 * Simple interface that only requires what it needs
 */
export interface AgentManagerConfig {
  agents: AgentConfig[]
}

export class AgentManager {
  constructor(
    private client: Client,
    private config: AgentManagerConfig
  ) {}

  /**
   * Synchronizes all configured RAG agents with Typesense
   */
  async syncAgents(): Promise<void> {
    // Get agents from configuration
    const agents = this.config.agents || []

    if (agents.length === 0) return

    logger.info(`Starting synchronization of ${agents.length} RAG agents...`)

    // Ensure history collections exist for all agents
    const historyCollections = new Set(agents.map(a => `conversation_history_${a.slug}`))
    for (const collectionName of historyCollections) {
      await ensureConversationCollection(this.client, collectionName)
    }

    // Sync each agent model
    for (const agent of agents) {
      await this.syncAgentModel(agent)
    }

    logger.info('Agent synchronization completed.')
  }

  private async syncAgentModel(agent: AgentConfig): Promise<boolean> {
    try {
      const modelConfig = {
        id: agent.slug,
        model_name: agent.llmModel,
        system_prompt: agent.systemPrompt,
        api_key: agent.apiKey,
        history_collection: `conversation_history_${agent.slug}`,
        max_bytes: agent.maxContextBytes || 65536,
        ttl: agent.ttl || 86400,
        k_results: agent.kResults || 5,
        max_tokens: agent.maxTokens || 16000,
        temperature: agent.temperature ?? 0.7,
        top_p: agent.topP ?? 0.95
      }

      // Direct API call logic
      return await this.upsertConversationModel(modelConfig)
    } catch (error) {
      logger.error(`Failed to sync agent ${agent.slug}`, error as Error)
      return false
    }
  }

  private async upsertConversationModel(modelConfig: any): Promise<boolean> {
    // Get configuration from client
    const configuration = this.client.configuration

    if (!configuration || !configuration.nodes || configuration.nodes.length === 0) {
      logger.error('Invalid Typesense client configuration')
      return false
    }

    const node = configuration.nodes[0] as NodeConfiguration
    const typesenseApiKey = configuration.apiKey
    const baseUrl = `${node.protocol}://${node.host}:${node.port}`

    try {
      // Try to create
      const createResponse = await fetch(`${baseUrl}/conversations/models`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-TYPESENSE-API-KEY': typesenseApiKey || ''
        },
        body: JSON.stringify(modelConfig)
      })

      if (createResponse.ok) {
        logger.info(`Agent model created: ${modelConfig.id}`)
        return true
      }

      if (createResponse.status === 409) {
        // Update if exists
        logger.debug(`Agent model ${modelConfig.id} exists, updating...`)
        const updateResponse = await fetch(`${baseUrl}/conversations/models/${modelConfig.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-TYPESENSE-API-KEY': typesenseApiKey || ''
          },
          body: JSON.stringify(modelConfig)
        })

        if (updateResponse.ok) {
          logger.info(`Agent model updated: ${modelConfig.id}`)
          return true
        } else {
          const err = await updateResponse.text()
          logger.error(`Failed to update agent ${modelConfig.id}: ${err}`)
          return false
        }
      }

      const err = await createResponse.text()
      logger.error(`Failed to create agent ${modelConfig.id}: ${err}`)
      return false
    } catch (networkError) {
      logger.error('Network error syncing agent model', networkError as Error)
      return false
    }
  }
}
