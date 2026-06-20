import { afterEach, describe, expect, it, vi } from 'vitest'
import { LiteLlmAdminClient, type LiteLlmVirtualKeyPayload } from './litellm-admin'

const PAYLOAD: LiteLlmVirtualKeyPayload = {
  keyAlias: 'agent/bastos',
  models: ['chat-premium'],
  metadata: { source: 'payload', agentId: 1, agentSlug: 'bastos', tenantSlug: 'internal' },
  maxBudget: 12,
  budgetDuration: '1d',
  rpmLimit: 10,
  tpmLimit: 1000
}

function stubFetch(body: unknown = { ok: true }, ok = true, status = 200) {
  const fn = vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body))
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('LiteLlmAdminClient', () => {
  it('generates a virtual key with LiteLLM snake_case fields', async () => {
    const fetchMock = stubFetch({ key: 'sk-litellm-agent' })
    const client = new LiteLlmAdminClient({ gatewayUrl: 'http://litellm:4000/', masterKey: 'sk-master' })

    await expect(client.generateKey(PAYLOAD)).resolves.toEqual({ key: 'sk-litellm-agent' })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://litellm:4000/key/generate',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer sk-master',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          key_alias: 'agent/bastos',
          models: ['chat-premium'],
          metadata: { source: 'payload', agentId: 1, agentSlug: 'bastos', tenantSlug: 'internal' },
          max_budget: 12,
          budget_duration: '1d',
          rpm_limit: 10,
          tpm_limit: 1000
        })
      })
    )
  })

  it('self-heals an alias collision: deletes the orphan and regenerates', async () => {
    const conflictBody = {
      error: { message: "Key with alias 'agent/bastos' already exists.", param: 'key_alias', code: '400' }
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve(conflictBody),
        text: () => Promise.resolve(JSON.stringify(conflictBody))
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ deleted_keys: ['agent/bastos'] }),
        text: () => Promise.resolve('')
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ key: 'sk-fresh' }),
        text: () => Promise.resolve('')
      })
    vi.stubGlobal('fetch', fetchMock)
    const client = new LiteLlmAdminClient({ gatewayUrl: 'http://litellm:4000', masterKey: 'sk-master' })

    await expect(client.generateKey(PAYLOAD)).resolves.toEqual({ key: 'sk-fresh' })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://litellm:4000/key/generate')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://litellm:4000/key/delete')
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string)).toEqual({ key_aliases: ['agent/bastos'] })
    expect(fetchMock.mock.calls[2]?.[0]).toBe('http://litellm:4000/key/generate')
  })

  it('does not retry a 400 that is not an alias collision', async () => {
    const badReq = { error: { message: 'models is required', param: 'models', code: '400' } }
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve(badReq),
      text: () => Promise.resolve(JSON.stringify(badReq))
    })
    vi.stubGlobal('fetch', fetchMock)
    const client = new LiteLlmAdminClient({ gatewayUrl: 'http://litellm:4000', masterKey: 'sk-master' })

    await expect(client.generateKey(PAYLOAD)).rejects.toThrow('HTTP 400')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('deletes keys by alias via /key/delete', async () => {
    const fetchMock = stubFetch({ deleted_keys: ['agent/bastos'] })
    const client = new LiteLlmAdminClient({ gatewayUrl: 'http://litellm:4000', masterKey: 'sk-master' })

    await client.deleteKeysByAlias(['agent/bastos'])

    expect(fetchMock).toHaveBeenCalledWith(
      'http://litellm:4000/key/delete',
      expect.objectContaining({ body: JSON.stringify({ key_aliases: ['agent/bastos'] }) })
    )
  })

  it('updates an existing key by key value', async () => {
    const fetchMock = stubFetch({})
    const client = new LiteLlmAdminClient({ gatewayUrl: 'http://litellm:4000', masterKey: 'sk-master' })

    await client.updateKey('sk-existing', PAYLOAD)

    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toMatchObject({
      key: 'sk-existing',
      key_alias: 'agent/bastos',
      models: ['chat-premium']
    })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://litellm:4000/key/update')
  })

  it('clears unset limits with null on update but omits them on generate', async () => {
    const fetchMock = stubFetch({ key: 'sk-generated' })
    const client = new LiteLlmAdminClient({ gatewayUrl: 'http://litellm:4000', masterKey: 'sk-master' })
    const noLimits: LiteLlmVirtualKeyPayload = { keyAlias: 'agent/bastos', models: ['chat-premium'], metadata: {} }

    await client.generateKey(noLimits)
    const genBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)
    expect(genBody).not.toHaveProperty('max_budget')
    expect(genBody).not.toHaveProperty('rpm_limit')

    await client.updateKey('sk-existing', noLimits)
    const updBody = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string)
    expect(updBody.max_budget).toBeNull()
    expect(updBody.budget_duration).toBeNull()
    expect(updBody.rpm_limit).toBeNull()
    expect(updBody.tpm_limit).toBeNull()
  })

  it('blocks an existing key', async () => {
    const fetchMock = stubFetch({})
    const client = new LiteLlmAdminClient({ gatewayUrl: 'http://litellm:4000', masterKey: 'sk-master' })

    await client.blockKey('sk-existing')

    expect(fetchMock).toHaveBeenCalledWith(
      'http://litellm:4000/key/block',
      expect.objectContaining({ body: JSON.stringify({ key: 'sk-existing' }) })
    )
  })

  it('throws on non-OK responses', async () => {
    stubFetch({ error: 'bad' }, false, 502)
    const client = new LiteLlmAdminClient({ gatewayUrl: 'http://litellm:4000', masterKey: 'sk-master' })

    await expect(client.blockKey('sk-existing')).rejects.toThrow('HTTP 502')
  })

  it('lists model names from /model/info', async () => {
    stubFetch({ data: [{ model_name: 'chat-premium' }, { model_name: 123 }, { model_name: 'economico' }] })
    const client = new LiteLlmAdminClient({ gatewayUrl: 'http://litellm:4000', masterKey: 'sk-master' })

    await expect(client.listModelNames()).resolves.toEqual(new Set(['chat-premium', 'economico']))
  })

  it('creates a model with /model/new', async () => {
    const fetchMock = stubFetch({})
    const client = new LiteLlmAdminClient({ gatewayUrl: 'http://litellm:4000', masterKey: 'sk-master' })

    await client.createModel({
      modelName: 'chat-premium',
      model: 'anthropic/claude-sonnet-4-6',
      modelInfo: { requires_key: 'anthropic', catalog_tier: 'premium' }
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://litellm:4000/model/new',
      expect.objectContaining({
        body: JSON.stringify({
          model_name: 'chat-premium',
          litellm_params: { model: 'anthropic/claude-sonnet-4-6' },
          model_info: { requires_key: 'anthropic', catalog_tier: 'premium' }
        })
      })
    )
  })

  it('bootstraps only missing models', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [{ model_name: 'chat-premium' }] }),
        text: () => Promise.resolve('')
      })
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve('')
      })
    vi.stubGlobal('fetch', fetchMock)
    const client = new LiteLlmAdminClient({ gatewayUrl: 'http://litellm:4000', masterKey: 'sk-master' })

    await expect(
      client.bootstrapModels([
        { modelName: 'chat-premium', model: 'anthropic/claude-sonnet-4-6' },
        { modelName: 'economico', model: 'gemini/gemini-2.5-flash' }
      ])
    ).resolves.toEqual({ created: 1, existing: 1 })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://litellm:4000/model/new')
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string)).toMatchObject({
      model_name: 'economico'
    })
  })
})
