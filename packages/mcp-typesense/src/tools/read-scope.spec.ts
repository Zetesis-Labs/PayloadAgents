/**
 * Scope enforcement on the read tools. v1 only closed the search path; an agent
 * could still read outside its retrieval profile by id/parent, and the metadata
 * tools advertised the whole tenant's taxonomies. These assert on the actual
 * `filter_by` sent to Typesense (or the taxonomy set returned).
 */

import { describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '../context'
import type { McpAuthContext } from '../types'
import { getChunksByIds } from './get-chunks-by-ids'
import { getChunksByParent } from './get-chunks-by-parent'
import { getCollectionStats } from './get-collection-stats'
import { getFilterCriteria } from './get-filter-criteria'
import { getTaxonomyTree } from './get-taxonomy-tree'

const chunkDef = {
  name: 'posts',
  displayName: 'Posts',
  kind: 'post',
  chunkCollection: 'posts_chunk',
  chunkSearchFields: ['chunk_text', 'title'],
  chunkFacetFields: ['tenant', 'taxonomy_slugs', 'parent_doc_id']
}

/** Fake Typesense: records the search params and returns a canned response. */
function makeCtx(searchImpl?: (params: Record<string, unknown>) => unknown) {
  const search = vi.fn(async (params: Record<string, unknown>) => searchImpl?.(params) ?? { hits: [], found: 0 })
  const documents = { search }
  const ctx = {
    typesense: { collections: () => ({ documents: () => documents }) },
    collections: {
      chunks: [chunkDef],
      chunkNames: ['posts_chunk'],
      byChunkName: (name: string) => (name === 'posts_chunk' ? chunkDef : undefined)
    },
    taxonomy: {
      getAll: vi.fn().mockResolvedValue([
        { id: 1, name: 'Bastos', slug: 'bastos', types: ['author'], breadcrumb: 'Bastos', parentSlug: null },
        {
          id: 2,
          name: 'Escohotado',
          slug: 'escohotado',
          types: ['author'],
          breadcrumb: 'Escohotado',
          parentSlug: null
        }
      ]),
      getTaxonomyMap: vi.fn().mockResolvedValue(new Map())
    }
  } as unknown as ToolContext
  return { ctx, search }
}

const filterOf = (search: ReturnType<typeof vi.fn>): string =>
  ((search.mock.calls[0]?.[0]?.filter_by as string) ?? '').split(' && ').filter(Boolean).sort().join(' && ')

const bastos: McpAuthContext = { tenantSlug: 'internal', taxonomySlugs: ['bastos'] }

describe('get_chunks_by_ids scope', () => {
  it('constrains the id lookup to the caller scope', async () => {
    const { ctx, search } = makeCtx()
    await getChunksByIds({ collection: 'posts_chunk', ids: ['156_chunk_3'] }, ctx, bastos)
    expect(filterOf(search)).toBe('id:[156_chunk_3] && taxonomy_slugs:=bastos && tenant:=internal')
  })

  it('reports chunks dropped by scope instead of pretending they are missing', async () => {
    const { ctx } = makeCtx(() => ({ hits: [], found: 0 }))
    const result = await getChunksByIds({ collection: 'posts_chunk', ids: ['a', 'b'] }, ctx, bastos)
    expect(result.total).toBe(0)
    expect(result.scope_notice).toMatch(/2 of the 2/)
  })

  it('adds no scope filter for an unscoped caller', async () => {
    const { ctx, search } = makeCtx()
    await getChunksByIds({ collection: 'posts_chunk', ids: ['x'] }, ctx, null)
    expect(filterOf(search)).toBe('id:[x]')
  })
})

describe('get_chunks_by_parent scope', () => {
  it('constrains a parent read to the caller scope', async () => {
    const { ctx, search } = makeCtx()
    await getChunksByParent({ collection: 'posts_chunk', parent_doc_id: '156' }, ctx, bastos)
    expect(filterOf(search)).toBe('parent_doc_id:=156 && taxonomy_slugs:=bastos && tenant:=internal')
  })

  it('keeps the chunk_index range alongside the scope', async () => {
    const { ctx, search } = makeCtx()
    await getChunksByParent(
      { collection: 'posts_chunk', parent_doc_id: '156', start_chunk: 2, end_chunk: 5 },
      ctx,
      bastos
    )
    const f = search.mock.calls[0]?.[0]?.filter_by as string
    expect(f).toContain('taxonomy_slugs:=bastos')
    expect(f).toContain('chunk_index:>=2')
    expect(f).toContain('chunk_index:<5')
  })
})

describe('get_filter_criteria scope', () => {
  it('facets within the caller scope, not the whole tenant', async () => {
    const { ctx, search } = makeCtx(() => ({ facet_counts: [{ field_name: 'taxonomy_slugs', counts: [] }] }))
    await getFilterCriteria({ collection: 'posts_chunk' }, ctx, bastos)
    const f = search.mock.calls[0]?.[0]?.filter_by as string
    expect(f).toContain('taxonomy_slugs:=bastos')
    expect(f).toContain('tenant:=internal')
  })
})

describe('get_collection_stats scope', () => {
  it('computes the distribution within the caller scope', async () => {
    const { ctx, search } = makeCtx(() => ({ found: 0, facet_counts: [] }))
    await getCollectionStats(ctx, bastos)
    const f = search.mock.calls[0]?.[0]?.filter_by as string
    expect(f).toContain('taxonomy_slugs:=bastos')
  })
})

describe('get_taxonomy_tree scope', () => {
  it('returns only the profile taxonomies, not the full tree', async () => {
    const { ctx } = makeCtx()
    const result = await getTaxonomyTree({}, ctx, bastos)
    expect(result.total).toBe(1)
    expect(result.flat?.map(n => n.slug)).toEqual(['bastos'])
  })

  it('returns the full tree for an unscoped caller', async () => {
    const { ctx } = makeCtx()
    const result = await getTaxonomyTree({}, ctx, null)
    expect(result.total).toBe(2)
  })
})
