import { describe, expect, it } from 'vitest'
import { parseScopeHeader, parseTenantHeader, scopeDenied, scopeFilter } from './scope'

describe('parseScopeHeader', () => {
  it('splits, trims and drops empties', () => {
    expect(parseScopeHeader(' bastos , mises ,,')).toEqual(['bastos', 'mises'])
  })

  it('joins an array header before parsing', () => {
    expect(parseScopeHeader(['bastos', 'mises'])).toEqual(['bastos', 'mises'])
  })

  it('returns [] for missing or empty header', () => {
    expect(parseScopeHeader(undefined)).toEqual([])
    expect(parseScopeHeader('')).toEqual([])
  })
})

describe('parseTenantHeader', () => {
  it('returns the trimmed single slug (first value of an array)', () => {
    expect(parseTenantHeader(' acme ')).toBe('acme')
    expect(parseTenantHeader(['acme', 'other'])).toBe('acme')
  })

  it('returns null for missing or empty', () => {
    expect(parseTenantHeader(undefined)).toBeNull()
    expect(parseTenantHeader('')).toBeNull()
    expect(parseTenantHeader('   ')).toBeNull()
  })
})

describe('scopeFilter', () => {
  it('forces tenant + taxonomy_slugs, overriding any client value', () => {
    expect(
      scopeFilter(
        { tenant: 'evil', taxonomy_slugs: ['mises'], parent_doc_id: '1' },
        { tenant: 'acme', taxonomySlugs: ['bastos'] }
      )
    ).toEqual({ tenant: 'acme', taxonomy_slugs: ['bastos'], parent_doc_id: '1' })
  })

  it('forces tenant even with no taxonomy (hard boundary)', () => {
    expect(scopeFilter({ parent_doc_id: '1' }, { tenant: 'acme', taxonomySlugs: [] })).toEqual({
      tenant: 'acme',
      parent_doc_id: '1'
    })
  })

  it('leaves the filter untouched when fully unscoped (single-tenant, broad)', () => {
    expect(scopeFilter({ parent_doc_id: '1' }, { tenant: null, taxonomySlugs: [] })).toEqual({ parent_doc_id: '1' })
  })
})

describe('scopeDenied (deny-by-default)', () => {
  it('denies only a fully-unscoped request when the server requires a scope', () => {
    expect(scopeDenied({ tenant: null, taxonomySlugs: [] }, true)).toBe(true)
    expect(scopeDenied({ tenant: null, taxonomySlugs: [] }, false)).toBe(false)
  })

  it('never denies a request scoped by tenant or taxonomy', () => {
    expect(scopeDenied({ tenant: 'acme', taxonomySlugs: [] }, true)).toBe(false)
    expect(scopeDenied({ tenant: null, taxonomySlugs: ['bastos'] }, true)).toBe(false)
  })
})
