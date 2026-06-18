/**
 * Payload Jobs task that reconciles an agent's LiteLLM virtual key.
 *
 * The Agents `afterChange`/`afterDelete` hooks enqueue this task instead of
 * calling LiteLLM inline, so saving an agent never waits on (nor fails with)
 * the gateway. The handler throws on LiteLLM failure; Payload retries it with
 * exponential backoff until the gateway recovers.
 */

import type { Field, TaskConfig } from 'payload'
import type { ResolvedPluginConfig } from '../../types'
import { notifyReload } from '../hooks/reload-runtime'
import {
  clientFor,
  decryptMaybe,
  LITELLM_SYNC_TASK_SLUG,
  type LiteLlmSyncJobInput,
  persistSyncError,
  syncAgentRecord
} from '../hooks/sync-litellm-virtual-key'

const inputSchema: Field[] = [
  { name: 'agentId', type: 'text' },
  { name: 'blockEncryptedKey', type: 'text' },
  { name: 'slug', type: 'text' }
]

// 8 attempts with exponential backoff from 10s (10s, 20s, 40s … ≈ 42 min total)
// so a LiteLLM outage is ridden out instead of being left in 'error'.
const SYNC_MAX_ATTEMPTS = 8

type SyncTaskIO = { input: LiteLlmSyncJobInput; output: Record<string, never> }

export function createSyncLiteLlmVirtualKeyTask(config: ResolvedPluginConfig): TaskConfig<SyncTaskIO> {
  return {
    slug: LITELLM_SYNC_TASK_SLUG,
    label: 'Sync LiteLLM virtual key',
    inputSchema,
    // Serialize sync jobs per agent: two concurrent first-time syncs would
    // otherwise both see "no key" and each mint one, orphaning a billable key.
    // With an exclusive key the second job waits, then sees the first's key and
    // updates instead of generating. Block jobs are idempotent — key separately.
    concurrency: ({ input }) =>
      input.agentId ? `agent:${input.agentId}` : `block:${input.blockEncryptedKey?.slice(-12) ?? 'unknown'}`,
    retries: { attempts: SYNC_MAX_ATTEMPTS, backoff: { type: 'exponential', delay: 10_000 } },
    // onFail fires on EVERY failed attempt; only write 'error' once retries are
    // exhausted (Payload's own final-error condition is totalTried >= attempts)
    // so the agent reads 'pending' while the gateway recovers, not a premature
    // 'error'. The block path (deleted agent) has no agent row left to update.
    onFail: async ({ input, req, taskStatus }) => {
      const typed = input as LiteLlmSyncJobInput | undefined
      if (!typed?.agentId) return
      if ((taskStatus?.totalTried ?? 0) < SYNC_MAX_ATTEMPTS) return
      await persistSyncError(req.payload, config, typed.agentId, 'LiteLLM virtual key sync failed after all retries')
    },
    handler: async ({ input, req }) => {
      const client = clientFor(config)

      // Block path — the agent was deleted, so its already-encrypted key rides
      // in the job payload. Decrypt and block; LiteLLM failure throws → retry.
      if (input.blockEncryptedKey) {
        const key = decryptMaybe(input.blockEncryptedKey, config.encryptionKey)
        if (key) await client.blockKey(key)
        return { output: {} }
      }

      if (!input.agentId) return { output: {} }

      const agent = await req.payload.findByID({
        collection: config.collectionSlug,
        id: input.agentId,
        depth: 1,
        overrideAccess: true,
        disableErrors: true,
        context: { internalAgentRead: true }
      })
      // Deleted between enqueue and run — the delete hook handles its own block.
      if (!agent) return { output: {} }

      // Throws on LiteLLM failure so Payload retries per `retries` above.
      await syncAgentRecord(client, req.payload, config, agent as Record<string, unknown>, req)
      // The agent's afterChange reload fired before this job minted the key, so
      // build_agent failed and the runtime dropped the agent. Notify again now
      // that the synced key is persisted — otherwise the agent stays fail-closed
      // until the runtime's 5-minute periodic resync or a pod restart.
      const slug = (agent as Record<string, unknown>).slug
      if (typeof slug === 'string' && slug) await notifyReload(req.payload, slug)
      return { output: {} }
    }
  }
}
