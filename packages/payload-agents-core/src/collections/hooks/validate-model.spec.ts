import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearModelCatalogCache } from '../../lib/model-catalog'
import type { ResolvedPluginConfig } from '../../types'
import { createModelCatalogValidateHook } from './validate-model'

const CATALOG_BODY = {
  data: [
    { model_name: 'chat-premium', model_info: { requires_key: 'anthropic' } },
    { model_name: 'chat-estandar', model_info: { requires_key: 'openai' } }
  ]
}

function configWith(modelCatalog: ResolvedPluginConfig['modelCatalog']): ResolvedPluginConfig {
  return { modelCatalog } as ResolvedPluginConfig
}

const CFG = configWith({ gatewayUrl: 'http://litellm:4000', masterKey: 'mk', cacheTtlMs: 60_000 })

function stubFetch(body: unknown = CATALOG_BODY, ok = true, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, status, json: () => Promise.resolve(body) }))
}

type HookArgs = Parameters<ReturnType<typeof createModelCatalogValidateHook>>[0]

function run(cfg: ResolvedPluginConfig, args: Record<string, unknown>) {
  return createModelCatalogValidateHook(cfg)(args as unknown as HookArgs)
}

afterEach(() => {
  clearModelCatalogCache()
  vi.unstubAllGlobals()
})

describe('createModelCatalogValidateHook', () => {
  it('rejects a create with a model outside the catalog', async () => {
    stubFetch()
    await expect(
      run(CFG, { data: { llmModel: 'openai/gpt-4o', apiKey: 'sk-abc' }, operation: 'create' })
    ).rejects.toThrow(/not a catalog preset/)
  })

  it('accepts a create with a preset and a matching key', async () => {
    stubFetch()
    const data = { llmModel: 'chat-premium', apiKey: 'sk-ant-abc' }
    await expect(run(CFG, { data, operation: 'create' })).resolves.toBe(data)
  })

  it('rejects a key whose format does not match the preset provider', async () => {
    stubFetch()
    await expect(
      run(CFG, { data: { llmModel: 'chat-premium', apiKey: 'sk-plain-openai' }, operation: 'create' })
    ).rejects.toThrow(/requires one/)
  })

  it('leaves untouched legacy documents alone on update', async () => {
    stubFetch()
    const data = { name: 'renamed only' }
    await expect(run(CFG, { data, operation: 'update', originalDoc: { llmModel: 'openai/gpt-4o' } })).resolves.toBe(
      data
    )
  })

  it('validates a new plaintext key against the preset of the existing model', async () => {
    stubFetch()
    await expect(
      run(CFG, {
        data: { apiKey: 'sk-plain-openai' },
        operation: 'update',
        originalDoc: { llmModel: 'chat-premium' }
      })
    ).rejects.toThrow(/requires one/)
  })

  it('skips validation (never blocks the write) when the gateway is down', async () => {
    stubFetch({}, false, 502)
    const data = { llmModel: 'chat-premium' }
    await expect(run(CFG, { data, operation: 'create' })).resolves.toBe(data)
  })
})
