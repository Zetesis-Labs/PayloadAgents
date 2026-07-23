/**
 * End-to-end guard for scope enforcement: asserts on the `filter_by` string
 * that actually reaches Typesense, not just on the helper in isolation.
 *
 * Regression covered: a caller passing `filters.taxonomy_slugs` used to REPLACE
 * its profile's hard filters (and `filters.tenant` let it read another tenant),
 * so an agent scoped to one author could retrieve any other.
 */

import { describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '../context'
import type { McpAuthContext } from '../types'
import { searchCollections } from './search-collections'

const chunkDef = {
  name: 'posts',
  displayName: 'Posts',
  kind: 'post',
  chunkCollection: 'posts_chunk',
  chunkSearchFields: ['chunk_text', 'title']
}

/** Captures the searches sent to Typesense and returns an empty result set. */
function makeCtx() {
  const perform = vi.fn().mockResolvedValue({ results: [{ found: 0, hits: [], search_time_ms: 1 }] })
  const ctx = {
    typesense: { multiSearch: { perform } },
    collections: {
      chunks: [chunkDef],
      documents: [],
      books: [],
      byChunkName: (name: string) => (name === 'posts_chunk' ? chunkDef : undefined),
      has: (name: string) => name === 'posts_chunk'
    },
    taxonomy: { resolveSlugs: vi.fn().mockResolvedValue([]) },
    content: null,
    resolveReranker: null,
    resolveProfileScope: null
  } as unknown as ToolContext
  return { ctx, perform }
}

/** Filter clauses as a set — key order follows the caller's object, which is not meaningful. */
const filterOf = (perform: ReturnType<typeof vi.fn>): string[] =>
  (perform.mock.calls[0]?.[0]?.searches?.[0]?.filter_by ?? '').split(' && ').filter(Boolean).sort()

const bastos: McpAuthContext = { tenantSlug: 'internal', taxonomySlugs: ['bastos'] }

describe('searchCollections scope enforcement', () => {
  it('applies the profile filters when the caller passes none', async () => {
    const { ctx, perform } = makeCtx()
    await searchCollections({ query: 'justicia' }, ctx, bastos)
    expect(filterOf(perform)).toEqual(['taxonomy_slugs:=bastos', 'tenant:=internal'])
  })

  it('does not run the query when the caller asks outside its profile scope', async () => {
    const { ctx, perform } = makeCtx()
    const result = await searchCollections({ query: 'drogas', filters: { taxonomy_slugs: 'escohotado' } }, ctx, bastos)
    expect(perform).not.toHaveBeenCalled()
    expect(result.hits).toEqual([])
    expect(result.total_found).toBe(0)
    expect(result.scope_notice).toMatch(/outside it/)
  })

  it('ignores a caller-supplied tenant', async () => {
    const { ctx, perform } = makeCtx()
    const result = await searchCollections({ query: 'empresa', filters: { tenant: 'la-forja' } }, ctx, bastos)
    expect(filterOf(perform)).toEqual(['taxonomy_slugs:=bastos', 'tenant:=internal'])
    expect(result.scope_notice).toMatch(/fixed to "internal"/)
  })

  it('lets the caller narrow within its scope', async () => {
    const { ctx, perform } = makeCtx()
    const multi: McpAuthContext = { tenantSlug: 'internal', taxonomySlugs: ['bastos', 'economia'] }
    await searchCollections({ query: 'dinero', filters: { taxonomy_slugs: 'economia' } }, ctx, multi)
    expect(filterOf(perform)).toEqual(['taxonomy_slugs:=economia', 'tenant:=internal'])
  })

  it('leaves unscoped callers unrestricted', async () => {
    const { ctx, perform } = makeCtx()
    await searchCollections({ query: 'drogas', filters: { taxonomy_slugs: 'escohotado' } }, ctx, null)
    expect(filterOf(perform)).toEqual(['taxonomy_slugs:=escohotado'])
  })

  it('honors an explicit per_page over the profile topK', async () => {
    const { ctx } = makeCtx()
    const capped: McpAuthContext = { tenantSlug: 'internal', retrieval: { topK: 10 } }
    const result = await searchCollections({ query: 'x', per_page: 2 }, ctx, capped)
    expect(result.per_page).toBe(2)
  })
})
