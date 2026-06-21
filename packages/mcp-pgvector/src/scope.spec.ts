import { describe, expect, it } from 'vitest'
import { parseScopeHeader, scopeDenied, scopeFilter } from './scope'

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

describe('scopeFilter', () => {
  it('forces taxonomy_slugs from the scope, overriding any client value', () => {
    expect(scopeFilter({ taxonomy_slugs: ['mises'], parent_doc_id: '1' }, ['bastos'])).toEqual({
      taxonomy_slugs: ['bastos'],
      parent_doc_id: '1'
    })
  })

  it('leaves the filter untouched when there is no scope', () => {
    expect(scopeFilter({ parent_doc_id: '1' }, [])).toEqual({ parent_doc_id: '1' })
  })
})

describe('scopeDenied (deny-by-default)', () => {
  it('denies an unscoped request only when the server requires a scope', () => {
    expect(scopeDenied([], true)).toBe(true)
    expect(scopeDenied([], false)).toBe(false)
  })

  it('never denies a scoped request', () => {
    expect(scopeDenied(['bastos'], true)).toBe(false)
    expect(scopeDenied(['bastos'], false)).toBe(false)
  })
})
