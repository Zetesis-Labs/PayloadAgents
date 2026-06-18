import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeDeleteHook,
  PayloadRequest
} from 'payload'
import { decrypt, encrypt, isEncrypted } from '../../lib/encryption'
import { LiteLlmAdminClient, type LiteLlmVirtualKeyPayload } from '../../lib/litellm-admin'
import type { ResolvedPluginConfig } from '../../types'

const SKIP_CONTEXT_KEY = 'skipLiteLlmVirtualKeySync'
const SKIP_RELOAD_CONTEXT_KEY = 'skipAgentRuntimeReload'
// Carries deleted agents' (re-encrypted) virtual keys from beforeDelete to
// afterDelete, keyed by agent id. afterRead strips the secret for non-superadmin
// callers, so the afterDelete doc alone can't be trusted to block the key; the
// map (rather than a single value) keeps bulk deletes from clobbering each other.
const PENDING_BLOCK_KEY_CONTEXT = 'litellmVirtualKeyPendingBlock'

/** Dedicated queue so virtual-key jobs never starve behind the host's jobs. */
export const LITELLM_SYNC_QUEUE = 'litellm-sync'
/** Task slug — kept in one place so the hook, the task and the plugin agree. */
export const LITELLM_SYNC_TASK_SLUG = 'syncLiteLlmVirtualKey'

/** Agent fields that change the LiteLLM virtual key and warrant a re-sync. */
const KEY_RELEVANT_FIELDS = [
  'slug',
  'llmModel',
  'isActive',
  'maxBudgetUsd',
  'budgetDuration',
  'rpmLimit',
  'tpmLimit'
] as const

type AgentRecord = Record<string, unknown>
type PayloadApi = PayloadRequest['payload']

/**
 * Input accepted by the `syncLiteLlmVirtualKey` task. Either reconcile a live
 * agent by id, or block a key whose agent was deleted (the doc is gone, so the
 * already-encrypted key value travels in the job payload).
 */
export interface LiteLlmSyncJobInput {
  agentId?: string
  blockEncryptedKey?: string
  slug?: string
}

function readString(record: AgentRecord, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' && value ? value : undefined
}

function readNumber(record: AgentRecord, key: string): number | undefined {
  const value = record[key]
  // Treat 0 / negatives as 'unset': forwarding rpm_limit:0 to LiteLLM pins the
  // key to 0 req/min (a self-inflicted outage), and negatives are invalid.
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  return undefined
}

function readTenantSlug(record: AgentRecord): string | undefined {
  const tenant = record.tenant
  if (!tenant || typeof tenant !== 'object') return undefined
  const slug = (tenant as Record<string, unknown>).slug
  return typeof slug === 'string' && slug ? slug : undefined
}

export function decryptMaybe(value: string | undefined, encryptionKey: string | undefined): string | undefined {
  if (!value) return undefined
  if (!encryptionKey || !isEncrypted(value)) return value
  return decrypt(value, encryptionKey)
}

function fingerprint(key: string): string {
  return key.slice(-4)
}

function keyAlias(slug: string): string {
  return `agent/${slug}`
}

function buildPayload(doc: AgentRecord, slug: string): LiteLlmVirtualKeyPayload {
  const model = readString(doc, 'llmModel')
  if (!model) throw new Error(`agent ${slug} missing llmModel`)
  return {
    keyAlias: keyAlias(slug),
    models: [model],
    metadata: {
      source: 'payload',
      agentId: doc.id,
      agentSlug: slug,
      tenantSlug: readTenantSlug(doc)
    },
    maxBudget: readNumber(doc, 'maxBudgetUsd'),
    budgetDuration: readString(doc, 'budgetDuration'),
    rpmLimit: readNumber(doc, 'rpmLimit'),
    tpmLimit: readNumber(doc, 'tpmLimit')
  }
}

async function persistSyncState(
  payload: PayloadApi,
  config: ResolvedPluginConfig,
  id: unknown,
  data: Record<string, unknown>,
  req?: PayloadRequest
): Promise<void> {
  await payload.update({
    collection: config.collectionSlug,
    id: id as string | number,
    data,
    overrideAccess: true,
    req,
    context: {
      [SKIP_CONTEXT_KEY]: true,
      [SKIP_RELOAD_CONTEXT_KEY]: true
    }
  })
}

/**
 * Persist a terminal sync failure on the agent. Called from the job's `onFail`
 * once all retries are exhausted, so an agent whose key never minted lands in
 * 'error' instead of being stuck 'pending' forever.
 */
export async function persistSyncError(
  payload: PayloadApi,
  config: ResolvedPluginConfig,
  id: unknown,
  message: string,
  req?: PayloadRequest
): Promise<void> {
  await persistSyncState(
    payload,
    config,
    id,
    { litellmVirtualKeySyncStatus: 'error', litellmVirtualKeySyncError: message },
    req
  )
}

export function clientFor(config: ResolvedPluginConfig): LiteLlmAdminClient {
  const { gatewayUrl, masterKey } = config.modelCatalog
  return new LiteLlmAdminClient({ gatewayUrl, masterKey })
}

async function syncDisabledAgent(
  client: LiteLlmAdminClient,
  payload: PayloadApi,
  config: ResolvedPluginConfig,
  id: unknown,
  existingKey: string | undefined,
  req?: PayloadRequest
): Promise<void> {
  if (existingKey) await client.blockKey(existingKey)
  await persistSyncState(
    payload,
    config,
    id,
    {
      litellmVirtualKeySyncStatus: existingKey ? 'blocked' : 'disabled',
      litellmVirtualKeySyncedAt: new Date().toISOString(),
      litellmVirtualKeySyncError: null
    },
    req
  )
}

async function syncActiveAgent(
  client: LiteLlmAdminClient,
  payloadApi: PayloadApi,
  config: ResolvedPluginConfig,
  id: unknown,
  record: AgentRecord,
  slug: string,
  existingKey: string | undefined,
  req?: PayloadRequest
): Promise<void> {
  const payload = buildPayload(record, slug)
  if (existingKey) {
    await client.updateKey(existingKey, payload)
    await persistSyncState(
      payloadApi,
      config,
      id,
      {
        litellmVirtualKeyAlias: payload.keyAlias,
        litellmVirtualKeyFingerprint: fingerprint(existingKey),
        litellmVirtualKeySyncStatus: 'synced',
        litellmVirtualKeySyncedAt: new Date().toISOString(),
        litellmVirtualKeySyncError: null
      },
      req
    )
    return
  }

  const generated = await client.generateKey(payload)
  const storedKey = config.encryptionKey ? encrypt(generated.key, config.encryptionKey) : generated.key
  try {
    await persistSyncState(
      payloadApi,
      config,
      id,
      {
        litellmVirtualKey: storedKey,
        litellmVirtualKeyAlias: payload.keyAlias,
        litellmVirtualKeyFingerprint: fingerprint(generated.key),
        litellmVirtualKeySyncStatus: 'synced',
        litellmVirtualKeySyncedAt: new Date().toISOString(),
        litellmVirtualKeySyncError: null
      },
      req
    )
  } catch (persistError) {
    // The key was already minted in LiteLLM but we failed to record it on the
    // agent. Block it so the job retry doesn't leave an orphaned active key,
    // then rethrow so the retry mints a fresh one against a clean state.
    await client.blockKey(generated.key).catch(() => {})
    throw persistError
  }
}

/**
 * Reconcile one agent's LiteLLM virtual key against its current Payload state.
 *
 * Pure side-effecting worker shared by the job handler and the startup
 * reconcile. Throws on LiteLLM failure so the caller (the job) can retry.
 * Returns `false` when the record carries no id/slug to act on.
 */
export async function syncAgentRecord(
  client: LiteLlmAdminClient,
  payload: PayloadApi,
  config: ResolvedPluginConfig,
  record: AgentRecord,
  req?: PayloadRequest
): Promise<boolean> {
  const id = record.id
  const slug = readString(record, 'slug')
  if (!id || !slug) return false

  const existingKey = decryptMaybe(readString(record, 'litellmVirtualKey'), config.encryptionKey)
  if (record.isActive === false) {
    if (!existingKey) {
      await persistSyncState(
        payload,
        config,
        id,
        { litellmVirtualKeySyncStatus: 'disabled', litellmVirtualKeySyncError: null },
        req
      )
      return true
    }
    await syncDisabledAgent(client, payload, config, id, existingKey, req)
    return true
  }

  await syncActiveAgent(client, payload, config, id, record, slug, existingKey, req)
  return true
}

// ── Enqueue helpers ─────────────────────────────────────────────────────────

interface QueueJobArgs {
  task: string
  input: LiteLlmSyncJobInput
  queue?: string
  req?: PayloadRequest
}

/**
 * Bridge to `payload.jobs.queue`. Inside the isolated package `TypedJobs` is
 * empty, so the typed `queue()` narrows `task` to `never`; we cast the function
 * to a string-slug signature in one place rather than at every call site.
 */
async function queueJob(payload: PayloadApi, args: QueueJobArgs): Promise<void> {
  const enqueue = payload.jobs.queue as unknown as (a: QueueJobArgs) => Promise<unknown>
  await enqueue({ ...args, queue: args.queue ?? LITELLM_SYNC_QUEUE })
}

async function enqueueSync(payload: PayloadApi, agentId: string, req?: PayloadRequest): Promise<void> {
  await queueJob(payload, { task: LITELLM_SYNC_TASK_SLUG, input: { agentId }, req })
}

function keyRelevantChanged(doc: AgentRecord, previous: AgentRecord | undefined): boolean {
  if (!previous) return true
  return KEY_RELEVANT_FIELDS.some(field => doc[field] !== previous[field])
}

export function createLiteLlmVirtualKeySyncAfterChangeHook(config: ResolvedPluginConfig): CollectionAfterChangeHook {
  return async ({ context, doc, previousDoc, req }) => {
    if (context?.[SKIP_CONTEXT_KEY] === true) return doc

    const record = doc as AgentRecord
    const id = record.id
    const slug = readString(record, 'slug')
    if (!id || !slug) return doc

    // Skip when nothing key-relevant changed and the key is already synced —
    // editing the name shouldn't re-mint the LiteLLM key. Anything not yet
    // 'synced' still gets re-enqueued so transient failures self-heal.
    const status = readString(record, 'litellmVirtualKeySyncStatus')
    if (status === 'synced' && !keyRelevantChanged(record, previousDoc as AgentRecord | undefined)) {
      return doc
    }

    try {
      await persistSyncState(req.payload, config, id, { litellmVirtualKeySyncStatus: 'pending' }, req)
      await enqueueSync(req.payload, String(id), req)
    } catch (error) {
      // Enqueue failures must never block the agent write — the startup
      // reconcile will pick the agent up on the next boot.
      const message = error instanceof Error ? error.message : 'Unknown enqueue error'
      console.warn(`[Agents] Failed to enqueue LiteLLM virtual key sync for "${slug}":`, message)
    }
    return doc
  }
}

/**
 * Capture the agent's virtual key *before* it is deleted. `afterRead` strips
 * `litellmVirtualKey` for non-superadmin / non-internal callers, so by the time
 * the afterDelete hook runs the doc no longer carries it — and the key would be
 * left active in LiteLLM (orphaned, billable). Read it with internal access and
 * stash the re-encrypted value on the request context, keyed by id.
 */
export function createLiteLlmVirtualKeySyncBeforeDeleteHook(config: ResolvedPluginConfig): CollectionBeforeDeleteHook {
  return async ({ context, id, req }) => {
    if (context?.[SKIP_CONTEXT_KEY] === true) return

    try {
      const agent = await req.payload.findByID({
        collection: config.collectionSlug,
        id,
        depth: 0,
        overrideAccess: true,
        disableErrors: true,
        context: { internalAgentRead: true }
      })
      const plaintextKey = agent
        ? decryptMaybe(readString(agent as AgentRecord, 'litellmVirtualKey'), config.encryptionKey)
        : undefined
      if (!plaintextKey) return
      const encryptedKey = config.encryptionKey ? encrypt(plaintextKey, config.encryptionKey) : plaintextKey
      const ctx = req.context as Record<string, unknown>
      const pending = (ctx[PENDING_BLOCK_KEY_CONTEXT] as Record<string, string> | undefined) ?? {}
      pending[String(id)] = encryptedKey
      ctx[PENDING_BLOCK_KEY_CONTEXT] = pending
    } catch (error) {
      // Best-effort: afterDelete falls back to the (possibly stripped) doc.
      const message = error instanceof Error ? error.message : 'Unknown read error'
      console.warn('[Agents] Failed to capture LiteLLM virtual key before delete:', message)
    }
  }
}

export function createLiteLlmVirtualKeySyncAfterDeleteHook(): CollectionAfterDeleteHook {
  return async ({ context, doc, req }) => {
    if (context?.[SKIP_CONTEXT_KEY] === true) return doc

    const record = doc as AgentRecord
    const slug = readString(record, 'slug')
    // Prefer the key captured by beforeDelete (afterRead strips it from the doc
    // for non-superadmin callers); fall back to the doc for internal/super-admin
    // deletes where it's still present. The agent row is gone, so the
    // already-encrypted value travels in the job and the handler decrypts it.
    const pending = (req.context as Record<string, unknown> | undefined)?.[PENDING_BLOCK_KEY_CONTEXT] as
      | Record<string, string>
      | undefined
    const encryptedKey = pending?.[String(record.id)] ?? readString(record, 'litellmVirtualKey')
    if (!encryptedKey) return doc

    try {
      await queueJob(req.payload, {
        task: LITELLM_SYNC_TASK_SLUG,
        input: { blockEncryptedKey: encryptedKey, slug },
        req
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown enqueue error'
      console.warn(
        `[Agents] Failed to enqueue LiteLLM virtual key block for deleted agent "${slug ?? 'unknown'}":`,
        message
      )
    }
    return doc
  }
}

export function shouldSkipAgentRuntimeReload(context: Record<string, unknown> | undefined): boolean {
  return context?.[SKIP_RELOAD_CONTEXT_KEY] === true
}

/**
 * Startup reconcile — enqueue a sync job for every agent that isn't already in
 * a resolved ('synced'/'blocked'/'disabled') state. Cheap and idempotent: the
 * jobs run on the `litellm-sync` queue after boot, so a LiteLLM outage during
 * startup no longer blocks the whole boot and self-heals once it recovers.
 */
export async function enqueueExistingLiteLlmVirtualKeySyncs(
  payload: PayloadApi,
  config: ResolvedPluginConfig
): Promise<void> {
  let page = 1
  let queued = 0

  while (true) {
    const result = await payload.find({
      collection: config.collectionSlug,
      depth: 0,
      limit: 100,
      page,
      overrideAccess: true,
      where: {
        or: [
          { litellmVirtualKeySyncStatus: { in: ['pending', 'error'] } },
          { litellmVirtualKeySyncStatus: { exists: false } }
        ]
      }
    })

    for (const doc of result.docs as AgentRecord[]) {
      const id = doc.id
      if (!id) continue
      try {
        await enqueueSync(payload, String(id))
        queued += 1
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown enqueue error'
        console.warn('[Agents] Failed to enqueue startup LiteLLM virtual key sync:', message)
      }
    }

    if (!result.hasNextPage || !result.nextPage) break
    page = result.nextPage
  }

  if (queued) {
    console.info(`[Agents] LiteLLM virtual key startup reconcile enqueued ${queued} sync job(s)`)
  }
}
