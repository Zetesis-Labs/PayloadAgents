import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../core/logging/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

import { logger } from '../core/logging/logger'
import { PgvectorAdapter } from './pgvector-adapter'
import type { PgvectorCollectionSchema } from './types'

/** Fake node-pg Pool/Client that records every query for assertions. */
class FakePool {
  queries: { text: string; params?: unknown[] }[] = []
  rows: Record<string, unknown>[] = []

  async query(text: string, params?: unknown[]) {
    this.queries.push({ text, params })
    return { rows: this.rows, rowCount: this.rows.length }
  }

  async connect() {
    return { query: (t: string, p?: unknown[]) => this.query(t, p), release: () => {} }
  }

  find(substr: string) {
    return this.queries.find(q => q.text.includes(substr))
  }

  last() {
    return this.queries[this.queries.length - 1]
  }
}

const schema: PgvectorCollectionSchema = {
  name: 'chunks',
  idField: 'id',
  embeddingField: 'embedding',
  embedFrom: ['chunk_text'],
  fields: [
    { name: 'id', type: 'text' },
    { name: 'parent_doc_id', type: 'text', index: true },
    { name: 'chunk_text', type: 'text' },
    { name: 'taxonomy_slugs', type: 'text[]', index: true, optional: true },
    { name: 'embedding', type: 'vector', dimensions: 3 }
  ]
}

describe('PgvectorAdapter', () => {
  let pool: FakePool
  let adapter: PgvectorAdapter

  beforeEach(() => {
    pool = new FakePool()
    adapter = new PgvectorAdapter(pool as never, { schema: 'pgvector' })
    adapter.registerCollection(schema)
  })

  describe('schema isolation', () => {
    it('requires a dedicated schema and rejects "public"', () => {
      expect(() => new PgvectorAdapter(pool as never, { schema: 'public' })).toThrow()
      expect(() => new PgvectorAdapter(pool as never, { schema: '' })).toThrow()
    })

    it('schema-qualifies every table reference', async () => {
      await adapter.vectorSearch('chunks', [0.1, 0.2, 0.3])
      expect(pool.last().text).toContain('FROM "pgvector"."chunks"')
    })
  })

  describe('buildWhere operator matrix (chosen by column type)', () => {
    it('text[] column + array value → overlap &&', async () => {
      await adapter.vectorSearch('chunks', [0.1, 0.2, 0.3], { filter: { taxonomy_slugs: ['bastos', 'mises'] } })
      expect(pool.last().text).toContain('"taxonomy_slugs" && $2::text[]')
    })

    it('text[] column + scalar value → membership = ANY(col)', async () => {
      await adapter.vectorSearch('chunks', [0.1, 0.2, 0.3], { filter: { taxonomy_slugs: 'bastos' } })
      expect(pool.last().text).toContain('$2 = ANY("taxonomy_slugs")')
    })

    it('scalar column + scalar value → equality', async () => {
      await adapter.vectorSearch('chunks', [0.1, 0.2, 0.3], { filter: { parent_doc_id: 'd1' } })
      expect(pool.last().text).toContain('"parent_doc_id" = $2')
    })

    it('scalar column + array value → IN list', async () => {
      await adapter.vectorSearch('chunks', [0.1, 0.2, 0.3], { filter: { parent_doc_id: ['d1', 'd2'] } })
      expect(pool.last().text).toContain('"parent_doc_id" = ANY($2::text[])')
    })
  })

  describe('vectorSearch param threading', () => {
    it('orders params: $1 vector, then WHERE, then LIMIT', async () => {
      await adapter.vectorSearch('chunks', [0.1, 0.2, 0.3], { filter: { parent_doc_id: 'd1' }, limit: 7 })
      const { text, params } = pool.last()
      expect(text).toContain('$1::vector')
      expect(text).toMatch(/LIMIT \$3$/)
      expect(params).toEqual(['[0.1,0.2,0.3]', 'd1', 7])
    })

    it('always excludes null embeddings even with no filter', async () => {
      await adapter.vectorSearch('chunks', [0.1, 0.2, 0.3], { limit: 4 })
      // Without this, NULL distance → Number(null)=0 would rank unembedded rows first.
      expect(pool.last().text).toContain('WHERE "embedding" IS NOT NULL')
      expect(pool.last().params).toEqual(['[0.1,0.2,0.3]', 4])
    })

    it('uses the cosine operator <=> by default', async () => {
      await adapter.vectorSearch('chunks', [0.1, 0.2, 0.3])
      expect(pool.last().text).toContain('<=>')
    })
  })

  describe('ensureCollection incompatible-schema warnings', () => {
    it('warns when the existing embedding column dimension differs from config', async () => {
      vi.mocked(logger.warn).mockClear()
      pool.rows = [{ dim: 1024 }] // pg_attribute reports the existing column as vector(1024)
      await adapter.ensureCollection(schema) // schema declares vector(3)
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('vector(1024) but config wants vector(3)')
      )
    })

    it('does not warn when the dimension matches (no existing column)', async () => {
      vi.mocked(logger.warn).mockClear()
      pool.rows = [] // column doesn't exist yet
      await adapter.ensureCollection(schema)
      expect(logger.warn).not.toHaveBeenCalled()
    })
  })

  describe('replaceDocumentsByFilter (atomic reindex)', () => {
    it('runs delete + insert in one transaction (BEGIN → DELETE → INSERT → COMMIT)', async () => {
      await adapter.replaceDocumentsByFilter('chunks', { parent_doc_id: 'd1' }, [
        // precomputed embedding so no EmbeddingProvider is needed for the test
        { id: '1', parent_doc_id: 'd1', chunk_text: 'a', embedding: [0.1, 0.2, 0.3] }
      ])
      const texts = pool.queries.map(q => q.text)
      const begin = texts.findIndex(t => t.includes('BEGIN'))
      const del = texts.findIndex(t => t.startsWith('DELETE'))
      const ins = texts.findIndex(t => t.includes('INSERT INTO'))
      const commit = texts.findIndex(t => t.includes('COMMIT'))
      expect(begin).toBeGreaterThanOrEqual(0)
      expect(begin).toBeLessThan(del)
      expect(del).toBeLessThan(ins)
      expect(ins).toBeLessThan(commit)
      expect(texts[del]).toContain('DELETE FROM "pgvector"."chunks"')
      expect(texts[del]).toContain('"parent_doc_id" =')
    })
  })

  describe('upsert', () => {
    it('builds INSERT ... ON CONFLICT DO UPDATE excluding the id column', async () => {
      await adapter.upsertDocument('chunks', {
        id: '1',
        parent_doc_id: 'd1',
        taxonomy_slugs: ['x'],
        embedding: [0.1, 0.2, 0.3]
      })
      const insert = pool.find('INSERT INTO')
      expect(insert?.text).toContain('INSERT INTO "pgvector"."chunks"')
      expect(insert?.text).toContain('ON CONFLICT ("id") DO UPDATE SET')
      expect(insert?.text).toContain('"parent_doc_id" = EXCLUDED."parent_doc_id"')
      // the id column must NOT be in the SET list
      expect(insert?.text).not.toContain('"id" = EXCLUDED."id"')
      // a precomputed embedding is cast to ::vector
      expect(insert?.text).toContain('::vector')
    })
  })

  describe('SQL-injection guard', () => {
    it('rejects a malicious table name via the identifier validator', async () => {
      await expect(adapter.ensureCollection({ ...schema, name: 'x"; DROP TABLE y; --' })).rejects.toThrow(
        /Invalid SQL identifier/
      )
    })
  })
})
