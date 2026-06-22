import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockAdapter } from '../../__test-utils__/mock-adapter'
import {
  createMockChunkedTableConfig,
  createMockDocument,
  createMockTableConfig
} from '../../__test-utils__/mock-documents'
import type { IndexerAdapter } from '../../adapter/types'

vi.mock('../../core/logging/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

const mockMapPayloadDocumentToIndex = vi.fn().mockResolvedValue({ title: 'Test Document' })
vi.mock('../../document/field-mapper', () => ({
  mapPayloadDocumentToIndex: (...args: unknown[]) => mockMapPayloadDocumentToIndex(...args)
}))

const mockChunkText = vi.fn().mockResolvedValue([
  { text: 'chunk one', index: 0, metadata: {} },
  { text: 'chunk two', index: 1, metadata: {} }
])
vi.mock('../../embedding/chunking/strategies', () => ({
  chunkText: (...args: unknown[]) => mockChunkText(...args),
  chunkMarkdown: vi.fn().mockResolvedValue([])
}))

const mockComputeContentHash = vi.fn().mockReturnValue('abc123hash')
vi.mock('../../core/utils/content-hash', () => ({
  computeContentHash: (...args: unknown[]) => mockComputeContentHash(...args)
}))

const mockBuildHeaderHierarchy = vi.fn().mockReturnValue([])
vi.mock('../../core/utils/header-utils', () => ({
  buildHeaderHierarchy: (...args: unknown[]) => mockBuildHeaderHierarchy(...args)
}))

const mockFormatChunkWithHeaders = vi.fn().mockImplementation((text: string) => text)
vi.mock('../../core/utils/chunk-format-utils', () => ({
  formatChunkWithHeaders: (...args: unknown[]) => mockFormatChunkWithHeaders(...args)
}))

const mockRecordSyncSuccess = vi.fn()
const mockRecordDeletion = vi.fn()
vi.mock('../../core/metrics/sync-metrics', () => ({
  recordSyncSuccess: (...args: unknown[]) => mockRecordSyncSuccess(...args),
  recordSyncFailure: vi.fn(),
  recordDeletion: (...args: unknown[]) => mockRecordDeletion(...args)
}))

import { deleteDocumentFromIndex, syncDocumentToIndex } from './document-syncer'

describe('DocumentSyncer (autoEmbed-only)', () => {
  let adapter: IndexerAdapter

  beforeEach(() => {
    adapter = createMockAdapter()
    mockRecordSyncSuccess.mockReset()
    mockRecordDeletion.mockReset()
    mockMapPayloadDocumentToIndex.mockReset().mockResolvedValue({ title: 'Test Document' })
    mockChunkText.mockReset().mockResolvedValue([
      { text: 'chunk one', index: 0, metadata: {} },
      { text: 'chunk two', index: 1, metadata: {} }
    ])
    mockComputeContentHash.mockReset().mockReturnValue('abc123hash')
    mockBuildHeaderHierarchy.mockReset().mockReturnValue([])
    mockFormatChunkWithHeaders.mockReset().mockImplementation((text: string) => text)
  })

  describe('syncDocument (non-chunked)', () => {
    it('maps fields and upserts document on create', async () => {
      const doc = createMockDocument()
      const config = createMockTableConfig()

      await syncDocumentToIndex(adapter, 'posts', doc, 'create', config)

      expect(adapter.upsertDocument).toHaveBeenCalledOnce()
      const upsertedDoc = vi.mocked(adapter.upsertDocument).mock.calls[0][1]
      expect(upsertedDoc.title).toBe('Test Document')
    })

    it('does not write an embedding field — backend handles it', async () => {
      const doc = createMockDocument()
      const config = createMockChunkedTableConfig()

      await syncDocumentToIndex(adapter, 'posts', doc, 'create', config)

      const upsertedChunks = vi.mocked(adapter.upsertDocuments).mock.calls[0][1]
      for (const chunk of upsertedChunks) {
        expect(chunk).not.toHaveProperty('embedding')
      }
    })
  })

  describe('content hash optimization (always-on)', () => {
    it('skips re-chunk on update when content unchanged (single-doc)', async () => {
      const doc = createMockDocument()
      const config = createMockTableConfig({
        embedding: {
          fields: ['content'],
          autoEmbed: { from: ['chunk_text'], modelConfig: { modelName: 'mock' } }
        }
      })

      vi.mocked(
        adapter.searchDocumentsByFilter as NonNullable<typeof adapter.searchDocumentsByFilter>
      ).mockResolvedValue([{ content_hash: 'abc123hash' }])
      vi.mocked(adapter.updateDocument as NonNullable<typeof adapter.updateDocument>).mockResolvedValue(undefined)

      await syncDocumentToIndex(adapter, 'posts', doc, 'update', config)

      expect(adapter.updateDocument).toHaveBeenCalledOnce()
      expect(adapter.upsertDocument).not.toHaveBeenCalled()
    })

    it('skips re-chunk on update when content unchanged (chunked)', async () => {
      const doc = createMockDocument()
      const config = createMockChunkedTableConfig()

      vi.mocked(
        adapter.searchDocumentsByFilter as NonNullable<typeof adapter.searchDocumentsByFilter>
      ).mockResolvedValue([{ content_hash: 'abc123hash' }])
      vi.mocked(
        adapter.updateDocumentsByFilter as NonNullable<typeof adapter.updateDocumentsByFilter>
      ).mockResolvedValue(2)

      await syncDocumentToIndex(adapter, 'posts', doc, 'update', config)

      expect(adapter.updateDocumentsByFilter).toHaveBeenCalledOnce()
      expect(adapter.upsertDocuments).not.toHaveBeenCalled()
    })

    it('full re-syncs on update when content changed', async () => {
      const doc = createMockDocument()
      const config = createMockChunkedTableConfig()

      vi.mocked(
        adapter.searchDocumentsByFilter as NonNullable<typeof adapter.searchDocumentsByFilter>
      ).mockResolvedValue([{ content_hash: 'different-hash' }])

      await syncDocumentToIndex(adapter, 'posts', doc, 'update', config)

      expect(adapter.upsertDocuments).toHaveBeenCalledOnce()
      expect(adapter.updateDocumentsByFilter).not.toHaveBeenCalled()
    })

    it('uses the adapter atomic replace path on update when implemented', async () => {
      const replaceDocumentsByFilter = vi.fn().mockResolvedValue(undefined)
      const atomic = createMockAdapter({ replaceDocumentsByFilter })
      vi.mocked(
        atomic.searchDocumentsByFilter as NonNullable<typeof atomic.searchDocumentsByFilter>
      ).mockResolvedValue([{ content_hash: 'different-hash' }])

      await syncDocumentToIndex(atomic, 'posts', createMockDocument(), 'update', createMockChunkedTableConfig())

      // Atomic path: one replace call, NOT the legacy delete-then-upsert.
      expect(replaceDocumentsByFilter).toHaveBeenCalledOnce()
      expect(atomic.deleteDocumentsByFilter).not.toHaveBeenCalled()
      expect(atomic.upsertDocuments).not.toHaveBeenCalled()
    })

    it('forces full re-sync via forceReindex even when content unchanged', async () => {
      const doc = createMockDocument()
      const config = createMockChunkedTableConfig()

      vi.mocked(
        adapter.searchDocumentsByFilter as NonNullable<typeof adapter.searchDocumentsByFilter>
      ).mockResolvedValue([{ content_hash: 'abc123hash' }])

      await syncDocumentToIndex(adapter, 'posts', doc, 'update', config, { forceReindex: true })

      expect(adapter.upsertDocuments).toHaveBeenCalledOnce()
      expect(adapter.updateDocumentsByFilter).not.toHaveBeenCalled()
    })

    it('falls back to full re-sync when hash lookup throws', async () => {
      const doc = createMockDocument()
      const config = createMockChunkedTableConfig()

      vi.mocked(
        adapter.searchDocumentsByFilter as NonNullable<typeof adapter.searchDocumentsByFilter>
      ).mockRejectedValue(new Error('network error'))

      await syncDocumentToIndex(adapter, 'posts', doc, 'update', config)

      expect(adapter.upsertDocuments).toHaveBeenCalledOnce()
    })
  })

  describe('syncChunked', () => {
    it('builds chunks before mutating', async () => {
      const doc = createMockDocument()
      const config = createMockChunkedTableConfig()
      const callOrder: string[] = []

      vi.mocked(adapter.deleteDocumentsByFilter).mockImplementation(async () => {
        callOrder.push('delete')
        return 0
      })
      vi.mocked(adapter.upsertDocuments).mockImplementation(async () => {
        callOrder.push('upsert')
      })

      await syncDocumentToIndex(adapter, 'posts', doc, 'update', config)

      const firstDelete = callOrder.indexOf('delete')
      const firstUpsert = callOrder.indexOf('upsert')
      expect(firstDelete).toBeLessThan(firstUpsert)
    })

    it('does not delete old chunks on create', async () => {
      const doc = createMockDocument()
      const config = createMockChunkedTableConfig()

      await syncDocumentToIndex(adapter, 'posts', doc, 'create', config)

      expect(adapter.deleteDocumentsByFilter).not.toHaveBeenCalled()
    })

    it('upserts every chunk produced', async () => {
      const doc = createMockDocument()
      const config = createMockChunkedTableConfig()

      await syncDocumentToIndex(adapter, 'posts', doc, 'create', config)

      expect(adapter.upsertDocuments).toHaveBeenCalledOnce()
      const chunks = vi.mocked(adapter.upsertDocuments).mock.calls[0][1]
      expect(chunks).toHaveLength(2)
      expect(chunks[0].id).toBe('doc-1_chunk_0')
      expect(chunks[1].id).toBe('doc-1_chunk_1')
    })

    it('records sync success with chunk count', async () => {
      const doc = createMockDocument()
      const config = createMockChunkedTableConfig()

      await syncDocumentToIndex(adapter, 'posts', doc, 'create', config)

      expect(mockRecordSyncSuccess).toHaveBeenCalledWith('posts', 'doc-1', 2)
    })

    it('returns early without source text', async () => {
      const doc = createMockDocument({ content: '' })
      const config = createMockChunkedTableConfig()

      await syncDocumentToIndex(adapter, 'posts', doc, 'create', config)

      expect(adapter.upsertDocuments).not.toHaveBeenCalled()
    })
  })

  describe('deleteDocumentFromIndex', () => {
    it('deletes by parent_doc_id for chunked tables', async () => {
      const config = createMockChunkedTableConfig()

      await deleteDocumentFromIndex(adapter, 'posts', 'doc-1', config)

      expect(adapter.deleteDocumentsByFilter).toHaveBeenCalledWith('posts', { parent_doc_id: 'doc-1' })
      expect(adapter.deleteDocument).not.toHaveBeenCalled()
    })

    it('deletes by id for non-chunked tables', async () => {
      const config = createMockTableConfig()

      await deleteDocumentFromIndex(adapter, 'posts', 'doc-1', config)

      expect(adapter.deleteDocument).toHaveBeenCalledWith('posts', 'doc-1')
    })

    it('records deletion metric when at least one delete succeeds', async () => {
      const config = createMockTableConfig()

      await deleteDocumentFromIndex(adapter, 'posts', 'doc-1', config)

      expect(mockRecordDeletion).toHaveBeenCalledWith('posts', 'doc-1')
    })
  })
})
