import { describe, expect, it } from 'vitest'
import type { McpAuthContext } from '../types'
import { applyScopeToFilters, buildFilterString, scopeFilterClauses } from './scope-filters'

const bastos: McpAuthContext = { tenantSlug: 'internal', taxonomySlugs: ['bastos'] }

describe('applyScopeToFilters', () => {
  it('passes filters through when there is no auth scope', () => {
    const result = applyScopeToFilters({ taxonomy_slugs: 'escohotado' }, null)
    expect(result.filters).toEqual({ taxonomy_slugs: 'escohotado' })
    expect(result.outOfScope).toBe(false)
    expect(result.notices).toEqual([])
  })

  it('applies the profile scope when the caller asks for nothing', () => {
    const result = applyScopeToFilters(undefined, bastos)
    expect(result.filters).toEqual({ tenant: 'internal', taxonomy_slugs: 'bastos' })
    expect(result.notices).toEqual([])
  })

  it('refuses to widen the profile scope (the reported bug)', () => {
    const result = applyScopeToFilters({ taxonomy_slugs: 'escohotado' }, bastos)
    expect(result.outOfScope).toBe(true)
    expect(result.filters?.taxonomy_slugs).toBe('bastos')
    expect(result.notices[0]).toMatch(/entirely outside it/)
  })

  it('narrows to the intersection and reports what it dropped', () => {
    const multi: McpAuthContext = { tenantSlug: 'internal', taxonomySlugs: ['bastos', 'economia', 'libertad'] }
    const result = applyScopeToFilters({ taxonomy_slugs: ['economia', 'escohotado'] }, multi)
    expect(result.outOfScope).toBe(false)
    expect(result.filters?.taxonomy_slugs).toBe('economia')
    expect(result.notices[0]).toMatch(/escohotado/)
  })

  it('keeps a caller filter fully inside the scope without notices', () => {
    const multi: McpAuthContext = { tenantSlug: 'internal', taxonomySlugs: ['bastos', 'economia'] }
    const result = applyScopeToFilters({ taxonomy_slugs: 'bastos' }, multi)
    expect(result.filters?.taxonomy_slugs).toBe('bastos')
    expect(result.notices).toEqual([])
  })

  it('never lets the caller switch tenant', () => {
    const result = applyScopeToFilters({ tenant: 'la-forja' }, bastos)
    expect(result.filters?.tenant).toBe('internal')
    expect(result.notices[0]).toMatch(/fixed to "internal"/)
  })

  it('enforces folder_slugs the same way', () => {
    const scoped: McpAuthContext = { tenantSlug: 'internal', folderSlugs: ['proyectos'] }
    expect(applyScopeToFilters({ folder_slugs: 'privado' }, scoped).outOfScope).toBe(true)
    expect(applyScopeToFilters(undefined, scoped).filters?.folder_slugs).toBe('proyectos')
  })

  it('leaves unscoped fields untouched', () => {
    const result = applyScopeToFilters({ headers: ['Capítulo 1'] }, bastos)
    expect(result.filters).toEqual({ headers: ['Capítulo 1'], tenant: 'internal', taxonomy_slugs: 'bastos' })
  })

  it('returns undefined filters when there is nothing to filter by', () => {
    expect(applyScopeToFilters(undefined, null).filters).toBeUndefined()
  })
})

describe('buildFilterString', () => {
  it('emits an exact-match clause for a scalar', () => {
    expect(buildFilterString({ tenant: 'internal' })).toBe('tenant:=internal')
  })

  it('emits an OR set for an array', () => {
    expect(buildFilterString({ taxonomy_slugs: ['bastos', 'economia'] })).toBe('taxonomy_slugs:[bastos,economia]')
  })

  it('joins multiple fields with &&', () => {
    expect(buildFilterString({ tenant: 'internal', taxonomy_slugs: 'bastos' })).toBe(
      'tenant:=internal && taxonomy_slugs:=bastos'
    )
  })
})

describe('scopeFilterClauses', () => {
  it('is empty without an auth scope', () => {
    expect(scopeFilterClauses(null)).toEqual([])
  })

  it('yields one clause per scoped field', () => {
    expect(scopeFilterClauses(bastos)).toEqual(['tenant:=internal', 'taxonomy_slugs:=bastos'])
  })

  it('OR-joins a multi-slug scope in a single clause', () => {
    const multi: McpAuthContext = { tenantSlug: 'internal', taxonomySlugs: ['bastos', 'economia'] }
    expect(scopeFilterClauses(multi)).toEqual(['tenant:=internal', 'taxonomy_slugs:[bastos,economia]'])
  })

  it('includes folder scope', () => {
    const scoped: McpAuthContext = { tenantSlug: 'internal', folderSlugs: ['proyectos'] }
    expect(scopeFilterClauses(scoped)).toEqual(['tenant:=internal', 'folder_slugs:=proyectos'])
  })
})
