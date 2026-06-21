import { describe, expect, it, vi } from 'vitest'
import { createProfileScopeResolver } from './resolver'

const scope = { taxonomySlugs: ['plotino'], retrieval: { learnedHead: { w: [0.1], b: 0.2 } } }

describe('createProfileScopeResolver', () => {
  it('caches within the TTL — one underlying fetch for repeated calls', async () => {
    const resolve = vi.fn().mockResolvedValue(scope)
    const r = createProfileScopeResolver({ resolve })

    expect(await r('t', 'neo')).toEqual(scope)
    expect(await r('t', 'neo')).toEqual(scope)
    expect(resolve).toHaveBeenCalledTimes(1)
  })

  it('keys the cache by tenant + slug', async () => {
    const resolve = vi.fn().mockImplementation(({ profileSlug }) => Promise.resolve({ taxonomySlugs: [profileSlug] }))
    const r = createProfileScopeResolver({ resolve })

    await r('t', 'neo')
    await r('t', 'hispanica')
    await r('other', 'neo')
    expect(resolve).toHaveBeenCalledTimes(3)
  })

  it('dedupes concurrent in-flight calls', async () => {
    const resolve = vi.fn().mockImplementation(() => new Promise(res => setTimeout(() => res(scope), 10)))
    const r = createProfileScopeResolver({ resolve })

    const [a, b] = await Promise.all([r('t', 'neo'), r('t', 'neo')])
    expect(a).toEqual(scope)
    expect(b).toEqual(scope)
    expect(resolve).toHaveBeenCalledTimes(1)
  })

  it('returns null for missing tenant or slug without calling resolve', async () => {
    const resolve = vi.fn()
    const r = createProfileScopeResolver({ resolve })
    expect(await r('', 'neo')).toBeNull()
    expect(await r('t', '')).toBeNull()
    expect(resolve).not.toHaveBeenCalled()
  })

  it('returns null on error when no stale cache is available', async () => {
    const resolve = vi.fn().mockRejectedValue(new Error('boom'))
    const r = createProfileScopeResolver({ resolve })
    expect(await r('t', 'neo')).toBeNull()
  })
})
