import { describe, expect, it } from 'vitest'
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
  it('returns auth unchanged when no slug', () => {
    expect(applyProfileScope(auth, undefined)).toBe(auth)
  })

  it('returns auth unchanged when slug not in groupProfiles (token route)', () => {
    expect(applyProfileScope(auth, 'zzz')).toBe(auth)
    expect(applyProfileScope({ tenantSlug: 't' }, 'a')).toEqual({ tenantSlug: 't' })
  })

  it('applies the chosen profile filters + lente over the base auth', () => {
    const scoped = applyProfileScope(auth, 'a')
    expect(scoped?.taxonomySlugs).toEqual(['mises'])
    expect(scoped?.folderSlugs).toEqual(['f1'])
    expect(scoped?.retrieval?.learnedHead).toEqual(lente)
    expect(scoped?.retrieval?.hybridAlpha).toBe(0.8)
    // tenant + catalog are preserved
    expect(scoped?.tenantSlug).toBe('t')
    expect(scoped?.availableProfiles).toBe(auth.availableProfiles)
  })

  it('replaces retrieval wholesale — a profile without a lente clears it', () => {
    const scoped = applyProfileScope(auth, 'b')
    expect(scoped?.taxonomySlugs).toEqual(['hayek'])
    expect(scoped?.retrieval?.learnedHead).toBeUndefined()
    expect(scoped?.retrieval?.rerankerKind).toBe('cohere')
  })

  it('returns null auth as-is', () => {
    expect(applyProfileScope(null, 'a')).toBeNull()
  })
})
