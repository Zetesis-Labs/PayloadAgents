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

describe('applyProfileScope', () => {
  it('returns auth unchanged when no slug', async () => {
    expect(await applyProfileScope(auth, undefined)).toBe(auth)
  })

  it('returns null auth as-is', async () => {
    expect(await applyProfileScope(null, 'a')).toBeNull()
  })

  it('applies the chosen profile filters + lente from groupProfiles (header/token route)', async () => {
    const scoped = await applyProfileScope(auth, 'a')
    expect(scoped?.taxonomySlugs).toEqual(['mises'])
    expect(scoped?.folderSlugs).toEqual(['f1'])
    expect(scoped?.retrieval?.learnedHead).toEqual(lente)
    expect(scoped?.retrieval?.hybridAlpha).toBe(0.8)
    expect(scoped?.tenantSlug).toBe('t')
    expect(scoped?.availableProfiles).toBe(auth.availableProfiles)
  })

  it('header source takes priority over the resolver', async () => {
    const resolver = vi.fn()
    const scoped = await applyProfileScope(auth, 'a', resolver)
    expect(scoped?.taxonomySlugs).toEqual(['mises'])
    expect(resolver).not.toHaveBeenCalled()
  })

  describe('on-demand resolver (Agno route — no groupProfiles)', () => {
    const bare: McpAuthContext = { tenantSlug: 't', availableProfiles: [{ slug: 'neo', name: 'Neo', description: '' }] }

    it('resolves the scope by slug+tenant when not in headers', async () => {
      const resolver = vi.fn().mockResolvedValue({ taxonomySlugs: ['plotino'], retrieval: { learnedHead: lente } })
      const scoped = await applyProfileScope(bare, 'neo', resolver)
      expect(resolver).toHaveBeenCalledWith('t', 'neo')
      expect(scoped?.taxonomySlugs).toEqual(['plotino'])
      expect(scoped?.retrieval?.learnedHead).toEqual(lente)
    })

    it('returns base auth when the resolver finds nothing', async () => {
      const resolver = vi.fn().mockResolvedValue(null)
      expect(await applyProfileScope(bare, 'zzz', resolver)).toBe(bare)
    })

    it('does not call the resolver without a tenant', async () => {
      const resolver = vi.fn()
      const noTenant: McpAuthContext = { availableProfiles: [] }
      expect(await applyProfileScope(noTenant, 'neo', resolver)).toBe(noTenant)
      expect(resolver).not.toHaveBeenCalled()
    })
  })
})
