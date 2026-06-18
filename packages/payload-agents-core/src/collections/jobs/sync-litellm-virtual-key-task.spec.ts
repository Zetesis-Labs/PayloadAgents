import { afterEach, describe, expect, it, vi } from 'vitest'
import { encrypt } from '../../lib/encryption'
import type { ResolvedPluginConfig } from '../../types'
import { createSyncLiteLlmVirtualKeyTask } from './sync-litellm-virtual-key-task'

const CFG = {
  collectionSlug: 'agents',
  encryptionKey: 'test-secret',
  modelCatalog: { gatewayUrl: 'http://litellm:4000', masterKey: 'sk-master', cacheTtlMs: 60_000 }
} as ResolvedPluginConfig

type OnFailArgs = Parameters<NonNullable<ReturnType<typeof createSyncLiteLlmVirtualKeyTask>['onFail']>>[0]

function onFailWith(input: unknown, totalTried: number) {
  const update = vi.fn().mockResolvedValue({})
  const task = createSyncLiteLlmVirtualKeyTask(CFG)
  const run = task.onFail?.({
    input,
    req: { payload: { update } },
    taskStatus: { totalTried }
  } as unknown as OnFailArgs)
  return { update, run }
}

describe('createSyncLiteLlmVirtualKeyTask onFail', () => {
  it('leaves the agent pending while retries remain', async () => {
    const { update, run } = onFailWith({ agentId: '1' }, 3)
    await run
    expect(update).not.toHaveBeenCalled()
  })

  it('marks the agent error once retries are exhausted', async () => {
    const { update, run } = onFailWith({ agentId: '1' }, 8)
    await run
    expect(update.mock.calls[0]?.[0].data).toMatchObject({
      litellmVirtualKeySyncStatus: 'error',
      litellmVirtualKeySyncError: expect.any(String)
    })
  })

  it('ignores the block path (a deleted agent has no row to update)', async () => {
    const { update, run } = onFailWith({ blockEncryptedKey: 'enc' }, 8)
    await run
    expect(update).not.toHaveBeenCalled()
  })
})

function stubFetch(body: unknown = { key: 'sk-generated' }) {
  const fn = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body))
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createSyncLiteLlmVirtualKeyTask handler', () => {
  function runHandler(input: unknown, req: unknown) {
    const handler = createSyncLiteLlmVirtualKeyTask(CFG).handler as (a: {
      input: unknown
      req: unknown
    }) => Promise<unknown>
    return handler({ input, req })
  }

  it('notifies the runtime to reload once the key is synced', async () => {
    stubFetch({ key: 'sk-generated' })
    const execute = vi.fn().mockResolvedValue(undefined)
    const update = vi.fn().mockResolvedValue({})
    const findByID = vi.fn().mockResolvedValue({
      id: 1,
      slug: 'bastos',
      isActive: true,
      llmModel: 'chat-premium',
      tenant: { slug: 'internal' }
    })

    await runHandler({ agentId: '1' }, { payload: { findByID, update, db: { drizzle: { execute } } } })

    // pg_notify(agent_reload, 'bastos') emitted via drizzle after the mint
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('does not reload on the block path (the deleted agent already reloaded)', async () => {
    stubFetch({})
    const execute = vi.fn().mockResolvedValue(undefined)

    await runHandler(
      { blockEncryptedKey: encrypt('sk-existing', 'test-secret') },
      { payload: { db: { drizzle: { execute } } } }
    )

    expect(execute).not.toHaveBeenCalled()
  })
})
