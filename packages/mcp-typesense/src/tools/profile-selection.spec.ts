import { describe, expect, it } from 'vitest'
import type { McpAuthContext } from '../types'
import { requireProfileSelection } from './search-collections'

const withProfiles = (slugs: string[]): McpAuthContext => ({
  tenantSlug: 't',
  availableProfiles: slugs.map(s => ({ slug: s, name: s, description: '' }))
})

describe('requireProfileSelection', () => {
  it('allows the call when no auth context is present', () => {
    expect(requireProfileSelection(null, undefined)).toBeNull()
  })

  it('allows the call when the token exposes no profiles (legacy/open search)', () => {
    expect(requireProfileSelection({ tenantSlug: 't' }, undefined)).toBeNull()
    expect(requireProfileSelection({ tenantSlug: 't', availableProfiles: [] }, 'anything')).toBeNull()
  })

  it('requires a choice when profiles exist and none was given', () => {
    const err = requireProfileSelection(withProfiles(['a', 'b']), undefined)
    expect(err?.error).toBe('retrieval_profile_required')
    expect(err?.available_profiles.map(p => p.slug)).toEqual(['a', 'b'])
    expect(err?.message).toMatch(/list_retrieval_profiles/)
  })

  it('rejects an unknown slug', () => {
    const err = requireProfileSelection(withProfiles(['a', 'b']), 'zzz')
    expect(err?.error).toBe('retrieval_profile_required')
    expect(err?.message).toMatch(/zzz/)
  })

  it('accepts a valid slug', () => {
    expect(requireProfileSelection(withProfiles(['a', 'b']), 'b')).toBeNull()
  })
})
