import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../core/logging/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

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

    it('omits WHERE and keeps vector+limit when no filter', async () => {
      await adapter.vectorSearch('chunks', [0.1, 0.2, 0.3], { limit: 4 })
      expect(pool.last().text).not.toContain('WHERE')
      expect(pool.last().params).toEqual(['[0.1,0.2,0.3]', 4])
    })

    it('uses the cosine operator <=> by default', async () => {
      await adapter.vectorSearch('chunks', [0.1, 0.2, 0.3])
      expect(pool.last().text).toContain('<=>')
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
