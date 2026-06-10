import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearModelCatalogCache, fetchModelCatalog, keyMatchesProvider } from './model-catalog'

const SETTINGS = { gatewayUrl: 'http://litellm:4000', masterKey: 'sk-master', cacheTtlMs: 60_000 }

function stubFetch(body: unknown, ok = true, status = 200) {
  const fn = vi.fn().mockResolvedValue({ ok, status, json: () => Promise.resolve(body) })
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  clearModelCatalogCache()
  vi.unstubAllGlobals()
})

describe('fetchModelCatalog', () => {
  it('maps /model/info entries into presets and skips the wildcard', async () => {
    stubFetch({
      data: [
        { model_name: '*', model_info: {} },
        {
          model_name: 'chat-premium',
          model_info: { description: 'High quality', requires_key: 'anthropic', catalog_tier: 'premium' }
        },
        { model_name: 'chat-estandar', model_info: { requires_key: 'openai' } }
      ]
    })
    const presets = await fetchModelCatalog(SETTINGS)
    expect(presets).toEqual([
      { name: 'chat-premium', description: 'High quality', requiresKey: 'anthropic', tier: 'premium' },
      { name: 'chat-estandar', description: undefined, requiresKey: 'openai', tier: undefined }
    ])
  })

  it('caches within the TTL', async () => {
    const fn = stubFetch({ data: [{ model_name: 'a', model_info: {} }] })
    await fetchModelCatalog(SETTINGS)
    await fetchModelCatalog(SETTINGS)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('throws on non-OK responses', async () => {
    stubFetch({}, false, 502)
    await expect(fetchModelCatalog(SETTINGS)).rejects.toThrow('HTTP 502')
  })
})

describe('keyMatchesProvider', () => {
  it('matches anthropic keys', () => {
    expect(keyMatchesProvider('sk-ant-abc', 'anthropic')).toBe(true)
    expect(keyMatchesProvider('sk-abc', 'anthropic')).toBe(false)
  })
  it('matches openai keys but not anthropic-prefixed ones', () => {
    expect(keyMatchesProvider('sk-abc', 'openai')).toBe(true)
    expect(keyMatchesProvider('sk-ant-abc', 'openai')).toBe(false)
  })
  it('matches google/gemini keys', () => {
    expect(keyMatchesProvider('AIzaXyz', 'google')).toBe(true)
    expect(keyMatchesProvider('AIzaXyz', 'gemini')).toBe(true)
    expect(keyMatchesProvider('sk-abc', 'google')).toBe(false)
  })
  it('does not block unknown providers', () => {
    expect(keyMatchesProvider('whatever', 'mistral')).toBe(true)
  })
})
