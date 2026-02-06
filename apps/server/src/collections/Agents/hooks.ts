import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000

/**
 * Sleep helper for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Build the Typesense connection config from environment variables
 */
function getTypesenseConfig() {
  return {
    nodes: [
      {
        host: process.env.TYPESENSE_HOST || 'localhost',
        port: parseInt(process.env.TYPESENSE_PORT || '8108', 10),
        protocol: (process.env.TYPESENSE_PROTOCOL || 'http') as 'http' | 'https'
      }
    ],
    apiKey: process.env.TYPESENSE_API_KEY || ''
  }
}

/**
 * Build the model config payload for Typesense from a Payload document
 */
function buildModelConfig(doc: Record<string, unknown>) {
  return {
    id: doc.slug,
    model_name: doc.llmModel,
    system_prompt: doc.systemPrompt,
    api_key: doc.apiKey,
    history_collection: `conversation_history_${doc.slug}`,
    max_bytes: (doc.maxContextBytes as number) || 65536,
    ttl: (doc.ttl as number) || 86400,
    k_results: (doc.kResults as number) || 5,
    max_tokens: 16000,
    temperature: 0.7,
    top_p: 0.95
  }
}

/**
 * Attempt a single sync of a model to Typesense (update or create).
 * Returns true if sync succeeded, or an Error if it failed.
 */
async function attemptSync(
  baseUrl: string,
  apiKey: string,
  slug: string,
  modelConfig: Record<string, unknown>
): Promise<true | Error> {
  const headers = {
    'Content-Type': 'application/json',
    'X-TYPESENSE-API-KEY': apiKey
  }

  const updateResponse = await fetch(`${baseUrl}/conversations/models/${slug}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(modelConfig)
  })

  if (updateResponse.ok) {
    console.log(`[Agents] Agent "${slug}" updated in Typesense`)
    return true
  }

  if (updateResponse.status === 404) {
    return attemptCreate(baseUrl, apiKey, slug, modelConfig)
  }

  const errorText = await updateResponse.text()
  return new Error(`Update failed: ${errorText}`)
}

/**
 * Attempt to create a new model in Typesense.
 * Returns true if creation succeeded, or an Error if it failed.
 */
async function attemptCreate(
  baseUrl: string,
  apiKey: string,
  slug: string,
  modelConfig: Record<string, unknown>
): Promise<true | Error> {
  const createResponse = await fetch(`${baseUrl}/conversations/models`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-TYPESENSE-API-KEY': apiKey
    },
    body: JSON.stringify(modelConfig)
  })

  if (createResponse.ok) {
    console.log(`[Agents] Agent "${slug}" created in Typesense`)
    return true
  }

  const errorText = await createResponse.text()
  return new Error(`Create failed: ${errorText}`)
}

/**
 * Re-sync agent with Typesense after changes
 * Includes retry mechanism for transient failures
 */
export const afterChangeHook: CollectionAfterChangeHook = async ({ doc, operation }) => {
  // Only sync if it's an update or create operation on an active agent
  if (!doc.isActive) {
    console.log(`[Agents] Skipping sync for inactive agent: ${doc.slug}`)
    return doc
  }

  console.log(`[Agents] Re-syncing agent "${doc.slug}" with Typesense after ${operation}...`)

  const typesenseConfig = getTypesenseConfig()
  const modelConfig = buildModelConfig(doc)

  const [node] = typesenseConfig.nodes
  if (!node) {
    console.warn('[Agents] Typesense is not configured')
    return
  }

  const baseUrl = `${node.protocol}://${node.host}:${node.port}`

  let lastError: Error | null = null
  let syncSucceeded = false

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await attemptSync(baseUrl, typesenseConfig.apiKey, doc.slug, modelConfig)
      if (result === true) {
        syncSucceeded = true
        break
      }
      lastError = result
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }

    // Log retry attempt
    if (attempt < MAX_RETRIES) {
      const delay = RETRY_DELAY_MS * 2 ** (attempt - 1)
      console.warn(`[Agents] Sync attempt ${attempt}/${MAX_RETRIES} failed. Retrying in ${delay}ms...`)
      await sleep(delay)
    }
  }

  // Final error handling - log clearly if sync failed after all retries
  if (!syncSucceeded) {
    console.error(`[Agents] SYNC FAILED after ${MAX_RETRIES} attempts for agent "${doc.slug}"`)
    console.error(`[Agents] Last error: ${lastError?.message}`)
    console.error(`[Agents] INCONSISTENCY: Agent "${doc.slug}" exists in PayloadCMS but NOT in Typesense!`)
    // TODO: Consider adding to a dead-letter queue or sending an alert
  }

  return doc
}

/**
 * Delete agent from Typesense after deletion from PayloadCMS
 */
export const afterDeleteHook: CollectionAfterDeleteHook = async ({ doc }) => {
  try {
    console.log(`[Agents] Deleting agent "${doc.slug}" from Typesense...`)

    const typesenseConfig = getTypesenseConfig()

    const [node] = typesenseConfig.nodes
    if (!node) {
      console.warn('[Agents] Typesense is not configured')
      return
    }
    const baseUrl = `${node.protocol}://${node.host}:${node.port}`

    const deleteResponse = await fetch(`${baseUrl}/conversations/models/${doc.slug}`, {
      method: 'DELETE',
      headers: {
        'X-TYPESENSE-API-KEY': typesenseConfig.apiKey
      }
    })

    if (deleteResponse.ok) {
      console.log(`[Agents] Agent "${doc.slug}" deleted from Typesense`)
    } else {
      const errorText = await deleteResponse.text()
      console.error(`[Agents] Failed to delete agent from Typesense:`, errorText)
    }
  } catch (error) {
    console.error(`[Agents] Error in afterDelete hook:`, error)
  }

  return doc
}
