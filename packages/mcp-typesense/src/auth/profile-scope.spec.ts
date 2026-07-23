import { describe, expect, it, vi } from 'vitest'
import type { McpAuthContext } from '../types'
import { applyProfileScope } from './profile-scope'

const lente = { w: [0.1, 0.2], b: 0.5 }

const auth: McpAuthContext = {
  tenantSlug: 't',
  taxonomySlugs: ['base'],
  retrieval: { hybridAlpha: 0.5 },
  availableProfiles: [
    { slug: 'a', name: 'A', description: '' },
    { slug: 'b', name: 'B', description: '' }
  ],
  groupProfiles: {
    a: { taxonomySlugs: ['mises'], folderSlugs: ['f1'], retrieval: { hybridAlpha: 0.8, learnedHead: lente } },
    b: { taxonomySlugs: ['hayek'], retrieval: { rerankerKind: 'cohere' } }
  }
}

/** Unwrap a successful result; fails the test when the scope errored. */
const unwrap = (result: Awaited<ReturnType<typeof applyProfileScope>>): McpAuthContext | null => {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.error}`)
  return result.auth
}

describe('applyProfileScope', () => {
  it('returns auth unchanged when no slug', async () => {
    expect(unwrap(await applyProfileScope(auth, undefined))).toBe(auth)
  })

  it('returns null auth as-is', async () => {
    expect(unwrap(await applyProfileScope(null, 'a'))).toBeNull()
  })

  it('applies the chosen profile filters + lente from groupProfiles (header/token route)', async () => {
    const scoped = unwrap(await applyProfileScope(auth, 'a'))
    expect(scoped?.taxonomySlugs).toEqual(['mises'])
    expect(scoped?.folderSlugs).toEqual(['f1'])
    expect(scoped?.retrieval?.learnedHead).toEqual(lente)
    expect(scoped?.retrieval?.hybridAlpha).toBe(0.8)
    expect(scoped?.tenantSlug).toBe('t')
    expect(scoped?.availableProfiles).toBe(auth.availableProfiles)
  })

  it('header source takes priority over the resolver', async () => {
    const resolver = vi.fn()
    const scoped = unwrap(await applyProfileScope(auth, 'a', resolver))
    expect(scoped?.taxonomySlugs).toEqual(['mises'])
    expect(resolver).not.toHaveBeenCalled()
  })

  it('skips the resolver when the request already carries that profile scope', async () => {
    const resolver = vi.fn()
    const applied: McpAuthContext = { tenantSlug: 't', taxonomySlugs: ['bastos'], defaultProfileSlug: 'bastos' }
    const scoped = unwrap(await applyProfileScope(applied, 'bastos', resolver))
    expect(scoped).toBe(applied)
    expect(resolver).not.toHaveBeenCalled()
  })

  describe('on-demand resolver (Agno route — no groupProfiles)', () => {
    const bare: McpAuthContext = { tenantSlug: 't', availableProfiles: [{ slug: 'neo', name: 'Neo', description: '' }] }

    it('resolves the scope by slug+tenant when not in headers', async () => {
      const resolver = vi.fn().mockResolvedValue({ taxonomySlugs: ['plotino'], retrieval: { learnedHead: lente } })
      const scoped = unwrap(await applyProfileScope(bare, 'neo', resolver))
      expect(resolver).toHaveBeenCalledWith('t', 'neo')
      expect(scoped?.taxonomySlugs).toEqual(['plotino'])
      expect(scoped?.retrieval?.learnedHead).toEqual(lente)
    })

    it('fails closed when the resolver finds nothing', async () => {
      const resolver = vi.fn().mockResolvedValue(null)
      const result = await applyProfileScope(bare, 'zzz', resolver)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.error).toBe('retrieval_profile_unresolved')
      expect(result.error.profile).toBe('zzz')
      expect(result.error.message).toMatch(/NOT executed/)
    })

    it('fails closed without a tenant instead of searching unscoped', async () => {
      const resolver = vi.fn()
      const noTenant: McpAuthContext = { availableProfiles: [] }
      const result = await applyProfileScope(noTenant, 'neo', resolver)
      expect(result.ok).toBe(false)
      expect(resolver).not.toHaveBeenCalled()
    })

    it('fails closed when no resolver is configured', async () => {
      const result = await applyProfileScope(bare, 'neo')
      expect(result.ok).toBe(false)
    })
  })
})
