import {
  decrypt,
  encrypt,
  LiteLlmAdminClient,
  type LiteLlmVirtualKeyPayload,
} from '@zetesis/payload-agents-core'
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeChangeHook,
  CollectionBeforeValidateHook,
} from 'payload'

const MAX_TOKENS_PER_USER = 10

// Context flag set when the sync hook writes the key fields back, so its own
// update does not re-trigger the afterChange sync.
const SKIP_KEY_SYNC = 'skipMcpTokenKeySync'

interface TokenRecord {
  id: number | string
  mcpServer?: string
  user?: unknown
  litellmVirtualKey?: string | null
  litellmVirtualKeySyncStatus?: string | null
}

/** LiteLLM admin client from env, or null when the gateway is not configured. */
function liteLlmClient(): LiteLlmAdminClient | null {
  const gatewayUrl = process.env.LITELLM_GATEWAY_URL
  const masterKey = process.env.LITELLM_MASTER_KEY
  if (!gatewayUrl || !masterKey) return null
  return new LiteLlmAdminClient({ gatewayUrl, masterKey })
}

/**
 * Mint/update a per-token LiteLLM virtual key scoped (via object_permission) to
 * the token's selected MCP backend. Routing through LiteLLM gives the external
 * token traceability + backend access control; the key is internal (the proxy
 * uses it upstream, the user never sees it). Best-effort: failures set an error
 * status but never block token creation.
 */
export const syncMcpTokenKeyAfterChange: CollectionAfterChangeHook = async ({ context, doc, previousDoc, req }) => {
  if (context?.[SKIP_KEY_SYNC]) return doc
  const record = doc as TokenRecord
  const mcpServer = record.mcpServer
  if (!mcpServer) return doc

  const prev = previousDoc as TokenRecord | undefined
  const needsSync =
    !record.litellmVirtualKey || record.litellmVirtualKeySyncStatus !== 'synced' || mcpServer !== prev?.mcpServer
  if (!needsSync) return doc

  const client = liteLlmClient()
  const encKey = process.env.PAYLOAD_SECRET
  if (!client || !encKey) return doc

  const persist = (data: Record<string, unknown>) =>
    req.payload.update({
      collection: 'mcp-search-tokens',
      id: record.id,
      data,
      overrideAccess: true,
      req,
      context: { [SKIP_KEY_SYNC]: true },
    })

  try {
    const keyPayload: LiteLlmVirtualKeyPayload = {
      keyAlias: `mcp-token/${record.id}`,
      models: [],
      metadata: { source: 'payload', mcpTokenId: String(record.id), userId: String(record.user ?? '') },
      objectPermission: { mcpServers: [mcpServer] },
    }
    const existing = record.litellmVirtualKey ? decrypt(record.litellmVirtualKey, encKey) : undefined
    let plaintextKey: string
    if (existing) {
      await client.updateKey(existing, keyPayload)
      plaintextKey = existing
    } else {
      plaintextKey = (await client.generateKey(keyPayload)).key
    }
    await persist({
      litellmVirtualKey: encrypt(plaintextKey, encKey),
      litellmVirtualKeyAlias: keyPayload.keyAlias,
      litellmVirtualKeyFingerprint: plaintextKey.slice(-4),
      litellmVirtualKeySyncStatus: 'synced',
      litellmVirtualKeySyncError: null,
    })
  } catch (error) {
    await persist({
      litellmVirtualKeySyncStatus: 'error',
      litellmVirtualKeySyncError: error instanceof Error ? error.message : 'Unknown error',
    }).catch(() => {})
  }
  return doc
}

/** Block the token's LiteLLM virtual key when the token is deleted. */
export const blockMcpTokenKeyAfterDelete: CollectionAfterDeleteHook = async ({ doc }) => {
  const record = doc as TokenRecord
  const client = liteLlmClient()
  const encKey = process.env.PAYLOAD_SECRET
  if (!client || !encKey || !record.litellmVirtualKey) return doc
  try {
    await client.blockKey(decrypt(record.litellmVirtualKey, encKey))
  } catch {
    // best-effort — the token is gone either way
  }
  return doc
}

export const setUserBeforeChange: CollectionBeforeChangeHook = ({ data, req, operation }) => {
  if (operation === 'create' && req.user) {
    return { ...data, user: req.user.id }
  }
  return data
}

export const enforceMaxTokens: CollectionBeforeValidateHook = async ({ data, req, operation }) => {
  if (operation !== 'create' || !req.user) return data
  const { totalDocs } = await req.payload.find({
    collection: 'mcp-search-tokens',
    where: { user: { equals: req.user.id } },
    limit: 0,
  })
  if (totalDocs >= MAX_TOKENS_PER_USER) {
    throw new Error(`Maximum ${MAX_TOKENS_PER_USER} tokens per user reached`)
  }
  return data
}
