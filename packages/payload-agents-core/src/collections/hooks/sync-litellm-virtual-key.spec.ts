import { afterEach, describe, expect, it, vi } from 'vitest'
import { decrypt, encrypt } from '../../lib/encryption'
import type { ResolvedPluginConfig } from '../../types'
import {
  clientFor,
  createLiteLlmVirtualKeySyncAfterChangeHook,
  createLiteLlmVirtualKeySyncAfterDeleteHook,
  createLiteLlmVirtualKeySyncBeforeDeleteHook,
  enqueueExistingLiteLlmVirtualKeySyncs,
  LITELLM_SYNC_QUEUE,
  LITELLM_SYNC_TASK_SLUG,
  syncAgentRecord
} from './sync-litellm-virtual-key'

const CFG = {
  collectionSlug: 'agents',
  encryptionKey: 'test-secret',
  modelCatalog: { gatewayUrl: 'http://litellm:4000', masterKey: 'sk-master', cacheTtlMs: 60_000 }
} as ResolvedPluginConfig

type AfterChangeArgs = Parameters<ReturnType<typeof createLiteLlmVirtualKeySyncAfterChangeHook>>[0]
type AfterDeleteArgs = Parameters<ReturnType<typeof createLiteLlmVirtualKeySyncAfterDeleteHook>>[0]
type BeforeDeleteArgs = Parameters<ReturnType<typeof createLiteLlmVirtualKeySyncBeforeDeleteHook>>[0]
type SyncPayload = Parameters<typeof syncAgentRecord>[1]
type SyncRecord = Parameters<typeof syncAgentRecord>[3]
type StartupPayload = Parameters<typeof enqueueExistingLiteLlmVirtualKeySyncs>[0]

function stubFetch(body: unknown = { key: 'sk-generated' }, ok = true, status = 200) {
  const fn = vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body))
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

function reqWithJobs() {
  const update = vi.fn().mockResolvedValue({})
  const queue = vi.fn().mockResolvedValue({})
  return { req: { payload: { update, jobs: { queue } } }, update, queue }
}

function activeDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    slug: 'bastos',
    isActive: true,
    llmModel: 'chat-premium',
    tenant: { slug: 'internal' },
    maxBudgetUsd: 12,
    budgetDuration: '1d',
    rpmLimit: 10,
    tpmLimit: 1000,
    ...overrides
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

// ── Hooks: enqueue only, never call LiteLLM inline ──────────────────────────

describe('createLiteLlmVirtualKeySyncAfterChangeHook', () => {
  it('marks the key pending and enqueues a sync job on a key-relevant change', async () => {
    const { req, update, queue } = reqWithJobs()

    await createLiteLlmVirtualKeySyncAfterChangeHook(CFG)({
      doc: activeDoc(),
      previousDoc: undefined,
      req,
      context: {}
    } as unknown as AfterChangeArgs)

    expect(update.mock.calls[0]?.[0].data).toMatchObject({ litellmVirtualKeySyncStatus: 'pending' })
    expect(queue).toHaveBeenCalledWith(
      expect.objectContaining({
        task: LITELLM_SYNC_TASK_SLUG,
        input: { agentId: '1' },
        queue: LITELLM_SYNC_QUEUE
      })
    )
  })

  it('skips enqueue when already synced and nothing key-relevant changed', async () => {
    const { req, queue } = reqWithJobs()
    const doc = activeDoc({ litellmVirtualKeySyncStatus: 'synced' })

    await createLiteLlmVirtualKeySyncAfterChangeHook(CFG)({
      doc,
      previousDoc: doc,
      req,
      context: {}
    } as unknown as AfterChangeArgs)

    expect(queue).not.toHaveBeenCalled()
  })

  it('re-enqueues an agent stuck in error even when nothing key-relevant changed', async () => {
    const { req, queue } = reqWithJobs()
    const doc = activeDoc({ litellmVirtualKeySyncStatus: 'error' })

    await createLiteLlmVirtualKeySyncAfterChangeHook(CFG)({
      doc,
      previousDoc: doc,
      req,
      context: {}
    } as unknown as AfterChangeArgs)

    expect(queue).toHaveBeenCalled()
  })
})

describe('createLiteLlmVirtualKeySyncAfterDeleteHook', () => {
  it('enqueues a block job carrying the already-encrypted key', async () => {
    const { req, queue } = reqWithJobs()
    const encryptedKey = encrypt('sk-existing', 'test-secret')

    await createLiteLlmVirtualKeySyncAfterDeleteHook()({
      doc: activeDoc({ litellmVirtualKey: encryptedKey }),
      req,
      context: {}
    } as unknown as AfterDeleteArgs)

    expect(queue).toHaveBeenCalledWith(
      expect.objectContaining({
        task: LITELLM_SYNC_TASK_SLUG,
        input: { blockEncryptedKey: encryptedKey, slug: 'bastos' }
      })
    )
  })
})

describe('createLiteLlmVirtualKeySyncBeforeDeleteHook', () => {
  it('captures the key so afterDelete still blocks it when afterRead stripped the doc', async () => {
    const queue = vi.fn().mockResolvedValue({})
    // With internalAgentRead the afterRead hook returns the DECRYPTED key.
    const findByID = vi.fn().mockResolvedValue(activeDoc({ litellmVirtualKey: 'sk-existing' }))
    const req = { payload: { jobs: { queue }, findByID }, context: {} }

    await createLiteLlmVirtualKeySyncBeforeDeleteHook(CFG)({
      id: 1,
      req,
      context: {}
    } as unknown as BeforeDeleteArgs)

    // The deleted doc no longer carries the secret (non-superadmin delete).
    await createLiteLlmVirtualKeySyncAfterDeleteHook()({
      doc: activeDoc({ litellmVirtualKey: undefined }),
      req,
      context: {}
    } as unknown as AfterDeleteArgs)

    expect(findByID).toHaveBeenCalledWith(
      expect.objectContaining({ context: { internalAgentRead: true }, overrideAccess: true })
    )
    const enqueued = queue.mock.calls[0]?.[0]
    expect(enqueued).toMatchObject({
      task: LITELLM_SYNC_TASK_SLUG,
      input: expect.objectContaining({ slug: 'bastos' })
    })
    expect(decrypt(enqueued.input.blockEncryptedKey, 'test-secret')).toBe('sk-existing')
  })
})

// ── syncAgentRecord: the actual LiteLLM reconciliation run by the task ───────

describe('syncAgentRecord', () => {
  it('generates and stores an encrypted virtual key for an active agent', async () => {
    const fetchMock = stubFetch({ key: 'sk-generated' })
    const update = vi.fn().mockResolvedValue({})

    await syncAgentRecord(clientFor(CFG), { update } as unknown as SyncPayload, CFG, activeDoc() as SyncRecord)

    expect(fetchMock).toHaveBeenCalledWith('http://litellm:4000/key/generate', expect.any(Object))
    const persisted = update.mock.calls[0]?.[0]
    expect(persisted.data.litellmVirtualKeyAlias).toBe('agent/bastos')
    expect(persisted.data.litellmVirtualKeySyncStatus).toBe('synced')
    expect(decrypt(persisted.data.litellmVirtualKey, 'test-secret')).toBe('sk-generated')
  })

  it('updates an existing virtual key when one is present', async () => {
    const fetchMock = stubFetch({})
    const update = vi.fn().mockResolvedValue({})
    const doc = activeDoc({ litellmVirtualKey: encrypt('sk-existing', 'test-secret') })

    await syncAgentRecord(clientFor(CFG), { update } as unknown as SyncPayload, CFG, doc as SyncRecord)

    expect(fetchMock).toHaveBeenCalledWith('http://litellm:4000/key/update', expect.any(Object))
    expect(update.mock.calls[0]?.[0].data).toMatchObject({
      litellmVirtualKeyAlias: 'agent/bastos',
      litellmVirtualKeySyncStatus: 'synced',
      litellmVirtualKeySyncError: null
    })
  })

  it('blocks the existing key when the agent is disabled', async () => {
    const fetchMock = stubFetch({})
    const update = vi.fn().mockResolvedValue({})
    const doc = activeDoc({ isActive: false, litellmVirtualKey: encrypt('sk-existing', 'test-secret') })

    await syncAgentRecord(clientFor(CFG), { update } as unknown as SyncPayload, CFG, doc as SyncRecord)

    expect(fetchMock).toHaveBeenCalledWith(
      'http://litellm:4000/key/block',
      expect.objectContaining({ body: JSON.stringify({ key: 'sk-existing' }) })
    )
    expect(update.mock.calls[0]?.[0].data).toMatchObject({ litellmVirtualKeySyncStatus: 'blocked' })
  })

  it('persists disabled without calling LiteLLM when an inactive agent has no key', async () => {
    const fetchMock = stubFetch({})
    const update = vi.fn().mockResolvedValue({})
    const doc = activeDoc({ isActive: false })

    await syncAgentRecord(clientFor(CFG), { update } as unknown as SyncPayload, CFG, doc as SyncRecord)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(update.mock.calls[0]?.[0].data).toMatchObject({
      litellmVirtualKeySyncStatus: 'disabled',
      litellmVirtualKeySyncError: null
    })
  })

  it('throws on LiteLLM failure so the job retries', async () => {
    stubFetch({ error: 'bad gateway' }, false, 502)
    const update = vi.fn().mockResolvedValue({})

    await expect(
      syncAgentRecord(clientFor(CFG), { update } as unknown as SyncPayload, CFG, activeDoc() as SyncRecord)
    ).rejects.toThrow(/HTTP 502/)
  })

  it('treats a zero rpm/tpm/budget as unset rather than forwarding 0 to LiteLLM', async () => {
    const fetchMock = stubFetch({ key: 'sk-generated' })
    const update = vi.fn().mockResolvedValue({})
    const doc = activeDoc({ rpmLimit: 0, tpmLimit: 0, maxBudgetUsd: 0 })

    await syncAgentRecord(clientFor(CFG), { update } as unknown as SyncPayload, CFG, doc as SyncRecord)

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)
    expect(body).not.toHaveProperty('rpm_limit')
    expect(body).not.toHaveProperty('tpm_limit')
    expect(body).not.toHaveProperty('max_budget')
  })
})

// ── Startup reconcile: enqueue, don't sync inline ───────────────────────────

describe('enqueueExistingLiteLlmVirtualKeySyncs', () => {
  it('enqueues a sync job for each unsynced agent', async () => {
    const find = vi.fn().mockResolvedValue({ docs: [activeDoc()], hasNextPage: false, nextPage: null })
    const queue = vi.fn().mockResolvedValue({})

    await enqueueExistingLiteLlmVirtualKeySyncs({ find, jobs: { queue } } as unknown as StartupPayload, CFG)

    expect(find).toHaveBeenCalledWith(expect.objectContaining({ collection: 'agents', overrideAccess: true }))
    expect(queue).toHaveBeenCalledWith(
      expect.objectContaining({ task: LITELLM_SYNC_TASK_SLUG, input: { agentId: '1' }, queue: LITELLM_SYNC_QUEUE })
    )
  })

  it('paginates through every agent when there is more than one page', async () => {
    const find = vi
      .fn()
      .mockResolvedValueOnce({ docs: [activeDoc({ id: 1 })], hasNextPage: true, nextPage: 2 })
      .mockResolvedValueOnce({ docs: [activeDoc({ id: 2, slug: 'mises' })], hasNextPage: false, nextPage: null })
    const queue = vi.fn().mockResolvedValue({})

    await enqueueExistingLiteLlmVirtualKeySyncs({ find, jobs: { queue } } as unknown as StartupPayload, CFG)

    expect(find).toHaveBeenCalledTimes(2)
    expect(find).toHaveBeenNthCalledWith(2, expect.objectContaining({ page: 2 }))
    expect(queue).toHaveBeenCalledTimes(2)
  })
})
