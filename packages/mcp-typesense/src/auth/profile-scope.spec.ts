import { describe, expect, it, vi } from 'vitest'
import type { McpAuthContext } from '../types'
import { applyProfileScope, isProfileGranted } from './profile-scope'

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

describe('cross-profile authorization (privilege boundary)', () => {
  it('rejects a slug the caller was not granted, before resolving anything', async () => {
    const resolver = vi.fn().mockResolvedValue({ taxonomySlugs: ['secret'] })
    const single: McpAuthContext = { tenantSlug: 't', defaultProfileSlug: 'bastos' }
    const result = await applyProfileScope(single, 'escohotado', resolver)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.error).toBe('retrieval_profile_forbidden')
    expect(resolver).not.toHaveBeenCalled()
  })

  it('allows the default, the catalog, and pre-resolved group profiles', () => {
    expect(isProfileGranted({ tenantSlug: 't', defaultProfileSlug: 'bastos' }, 'bastos')).toBe(true)
    expect(isProfileGranted(auth, 'a')).toBe(true) // catalog
    expect(isProfileGranted(auth, 'b')).toBe(true) // catalog + groupProfiles
    expect(isProfileGranted(auth, 'zzz')).toBe(false)
  })

  it('treats an unscoped token as open (any slug allowed)', () => {
    expect(isProfileGranted({ tenantSlug: 't' }, 'anything')).toBe(true)
    expect(isProfileGranted(null, 'anything')).toBe(true)
  })
})

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

  it('REGRESSION (Agno single-profile): a bare default slug with no scope headers is resolved, never trusted', async () => {
    // The Agno builder sends `x-retrieval-profile: bastos` alone when the
    // agent doc carries no taxonomy filters of its own. Trusting the bare slug
    // ran the search with no profile filters at all — the original leak.
    const resolver = vi.fn().mockResolvedValue({ taxonomySlugs: ['bastos'] })
    const bareSlug: McpAuthContext = { tenantSlug: 't', defaultProfileSlug: 'bastos' }
    const scoped = unwrap(await applyProfileScope(bareSlug, 'bastos', resolver))
    expect(resolver).toHaveBeenCalledWith('t', 'bastos')
    expect(scoped?.taxonomySlugs).toEqual(['bastos'])
  })

  it('fails closed on a bare default slug when no resolver is configured', async () => {
    const bareSlug: McpAuthContext = { tenantSlug: 't', defaultProfileSlug: 'bastos' }
    const result = await applyProfileScope(bareSlug, 'bastos')
    expect(result.ok).toBe(false)
  })

  it('prefers the resolved profile over the header scope (profile doc is the source of truth)', async () => {
    const resolver = vi.fn().mockResolvedValue({ taxonomySlugs: ['fresh'] })
    const applied: McpAuthContext = { tenantSlug: 't', taxonomySlugs: ['stale'], defaultProfileSlug: 'bastos' }
    const scoped = unwrap(await applyProfileScope(applied, 'bastos', resolver))
    expect(scoped?.taxonomySlugs).toEqual(['fresh'])
  })

  it('falls back to header scope when the resolver finds nothing for the applied default profile', async () => {
    const resolver = vi.fn().mockResolvedValue(null)
    const applied: McpAuthContext = { tenantSlug: 't', taxonomySlugs: ['bastos'], defaultProfileSlug: 'bastos' }
    const scoped = unwrap(await applyProfileScope(applied, 'bastos', resolver))
    expect(scoped).toBe(applied)
  })

  it('accepts header scope for the default profile when no resolver is configured', async () => {
    const applied: McpAuthContext = { tenantSlug: 't', taxonomySlugs: ['bastos'], defaultProfileSlug: 'bastos' }
    const scoped = unwrap(await applyProfileScope(applied, 'bastos'))
    expect(scoped).toBe(applied)
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

    it('fails closed when a GRANTED slug cannot be resolved', async () => {
      // 'neo' is in the catalog (granted) but the resolver comes up empty —
      // this is the fail-closed path, distinct from an ungranted slug (forbidden).
      const resolver = vi.fn().mockResolvedValue(null)
      const result = await applyProfileScope(bare, 'neo', resolver)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.error).toBe('retrieval_profile_unresolved')
      expect(result.error.profile).toBe('neo')
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
