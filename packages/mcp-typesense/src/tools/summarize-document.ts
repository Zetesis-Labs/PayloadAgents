/**
 * Tool: summarize_document
 *
 * LLM-powered synthesis. Reads a document (or a chunk range of one) from
 * Typesense via `get_chunks_by_parent`, splits into token-budgeted bundles,
 * runs a map-reduce sampling pipeline, and returns a focused summary plus
 * verified key-claim citations.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { ToolContext } from '../context'
import { bundleChunks, type PromptChunk, verifyCitations } from '../prompts/shared'
import {
  type BundleSummary,
  buildMapUser,
  buildReduceUser,
  MAP_SYSTEM,
  type MapOutput,
  mapOutputSchema,
  REDUCE_SYSTEM,
  reduceOutputSchema
} from '../prompts/summarize-document'
import {
  hasSamplingCapability,
  requestStructuredSampling,
  SamplingError,
  type SamplingNotSupportedError,
  samplingNotSupportedError
} from '../sampling'
import type { McpAuthContext } from '../types'
import { getChunksByParent } from './get-chunks-by-parent'

// ============================================================================
// SCHEMA
// ============================================================================

const DEFAULT_MAX_CHUNKS = 80
const MAX_MAX_CHUNKS = 200
const BUNDLE_TOKEN_BUDGET = 8000
const MAP_MAX_TOKENS = 1500
const REDUCE_MAX_TOKENS = 2000

export const summarizeDocumentSchema = z.object({
  collection: z.string().describe('Chunk collection name.'),
  parent_doc_id: z.string().describe('The parent document ID to summarize.'),
  focus: z.string().optional().describe('Optional theme to orient the summary.'),
  start_chunk: z.number().int().min(0).optional().describe('Inclusive start of chunk_index range.'),
  end_chunk: z.number().int().min(0).optional().describe('Exclusive end of chunk_index range.'),
  max_chunks: z
    .number()
    .int()
    .min(1)
    .max(MAX_MAX_CHUNKS)
    .optional()
    .describe(`Hard cap on chunks processed. Default: ${DEFAULT_MAX_CHUNKS}. Max: ${MAX_MAX_CHUNKS}.`),
  retrieval_profile: z
    .string()
    .optional()
    .describe(
      'Profile slug whose scope governs this read. Pass the SAME profile you searched with. Defaults to your default profile.'
    )
})

export type SummarizeDocumentInput = z.infer<typeof summarizeDocumentSchema>

// ============================================================================
// RESULT TYPES
// ============================================================================

export interface SummarizeDocumentSuccess {
  parent_doc_id: string
  collection: string
  title: string
  total_chunks_in_doc: number
  chunks_used: number
  focus?: string
  summary: string
  key_claims: Array<{ text: string; chunk_id: string; verified: boolean }>
  model: string
  sampling_calls: number
  sampling_time_ms: number
}

export interface SummarizeDocumentErrorResult {
  error: string
  message?: string
  [key: string]: unknown
}

export type SummarizeDocumentResult =
  | SummarizeDocumentSuccess
  | SummarizeDocumentErrorResult
  | SamplingNotSupportedError

// ============================================================================
// TOOL
// ============================================================================

export async function summarizeDocument(
  input: SummarizeDocumentInput,
  ctx: ToolContext,
  auth: McpAuthContext | null,
  server: McpServer,
  signal?: AbortSignal
): Promise<SummarizeDocumentResult> {
  if (!hasSamplingCapability(server)) {
    return samplingNotSupportedError({
      tool: 'get_chunks_by_parent',
      suggested_call: {
        collection: input.collection,
        parent_doc_id: input.parent_doc_id,
        start_chunk: input.start_chunk,
        end_chunk: input.end_chunk,
        per_page: 50
      },
      reason: 'Fetch the raw chunks and summarize them yourself.'
    })
  }

  if (!ctx.collections.has(input.collection)) {
    return {
      error: 'unknown_collection',
      message: `Unknown collection: ${input.collection}. Available: ${ctx.collections.chunkNames.join(', ')}`
    }
  }

  const fetched = await fetchChunks(input, ctx, auth)
  if ('error' in fetched) return fetched

  const { chunks, rangeTotal, title } = fetched
  if (chunks.length === 0) {
    return {
      error: 'no_chunks_found',
      message: `No chunks found for parent_doc_id ${input.parent_doc_id} in ${input.collection}.`,
      parent_doc_id: input.parent_doc_id,
      collection: input.collection
    }
  }

  const maxChunks = input.max_chunks ?? DEFAULT_MAX_CHUNKS
  if (rangeTotal > maxChunks) {
    return {
      error: 'document_too_large',
      message: `Document has ${rangeTotal} chunks in the requested range; max_chunks is ${maxChunks}.`,
      range_total: rangeTotal,
      max_chunks: maxChunks,
      hint: 'Pass start_chunk/end_chunk to scope a section, raise max_chunks (capped at 200), or use get_book_toc to locate the chapter you care about.'
    }
  }

  const passedIds = new Set(chunks.map(c => c.chunk_id))
  const bundles = bundleChunks(chunks, BUNDLE_TOKEN_BUDGET)

  const start = Date.now()
  try {
    const mapResults = await runMapPhase(server, bundles, input.focus, signal)
    const reduced = await maybeReducePhase(server, mapResults, input.focus, signal)
    const verifiedClaims = verifyCitations(reduced.key_claims, passedIds)

    return {
      parent_doc_id: input.parent_doc_id,
      collection: input.collection,
      title,
      total_chunks_in_doc: rangeTotal,
      chunks_used: chunks.length,
      ...(input.focus ? { focus: input.focus } : {}),
      summary: reduced.summary,
      key_claims: verifiedClaims,
      model: reduced.model,
      sampling_calls: mapResults.length + (bundles.length > 1 ? 1 : 0),
      sampling_time_ms: Date.now() - start
    }
  } catch (err) {
    return shapeSamplingError(err)
  }
}

// ============================================================================
// HELPERS
// ============================================================================

interface FetchedChunks {
  chunks: PromptChunk[]
  rangeTotal: number
  title: string
}

async function fetchChunks(
  input: SummarizeDocumentInput,
  ctx: ToolContext,
  auth: McpAuthContext | null
): Promise<FetchedChunks | SummarizeDocumentErrorResult> {
  const perPage = Math.min(input.max_chunks ?? DEFAULT_MAX_CHUNKS, MAX_MAX_CHUNKS, 100)
  const result = await getChunksByParent(
    {
      collection: input.collection,
      parent_doc_id: input.parent_doc_id,
      start_chunk: input.start_chunk,
      end_chunk: input.end_chunk,
      per_page: perPage
    },
    ctx,
    auth
  )

  if ('error' in result) {
    return { error: 'get_chunks_failed', message: result.error }
  }

  const chunks: PromptChunk[] = result.chunks.map(c => ({
    chunk_id: c.id,
    chunk_index: c.chunk_index,
    chunk_text: c.chunk_text,
    headers: c.headers
  }))

  const title = result.chunks[0]?.title ?? ''
  return { chunks, rangeTotal: result.range_total, title }
}

async function runMapPhase(
  server: McpServer,
  bundles: PromptChunk[][],
  focus: string | undefined,
  signal: AbortSignal | undefined
): Promise<Array<BundleSummary & { model: string }>> {
  return Promise.all(
    bundles.map(async bundle => {
      const res = await requestStructuredSampling<MapOutput>(
        server,
        {
          system: MAP_SYSTEM,
          user: buildMapUser(bundle, focus),
          maxTokens: MAP_MAX_TOKENS,
          temperature: 0.3
        },
        mapOutputSchema,
        signal
      )
      return { summary: res.data.summary, claims: res.data.claims, model: res.model }
    })
  )
}

async function maybeReducePhase(
  server: McpServer,
  mapResults: Array<BundleSummary & { model: string }>,
  focus: string | undefined,
  signal: AbortSignal | undefined
): Promise<{ summary: string; key_claims: Array<{ text: string; chunk_id: string }>; model: string }> {
  const firstModel = mapResults[0]?.model ?? 'unknown'
  if (mapResults.length === 1) {
    const only = mapResults[0]
    if (!only) {
      throw new SamplingError('CLIENT_ERROR', 'Map phase returned no results.')
    }
    return {
      summary: only.summary,
      key_claims: only.claims,
      model: only.model
    }
  }

  const res = await requestStructuredSampling(
    server,
    {
      system: REDUCE_SYSTEM,
      user: buildReduceUser(
        mapResults.map(r => ({ summary: r.summary, claims: r.claims })),
        focus
      ),
      maxTokens: REDUCE_MAX_TOKENS,
      temperature: 0.3
    },
    reduceOutputSchema,
    signal
  )
  return {
    summary: res.data.summary,
    key_claims: res.data.key_claims,
    model: res.model || firstModel
  }
}

function shapeSamplingError(err: unknown): SummarizeDocumentErrorResult {
  if (err instanceof SamplingError) {
    return {
      error: `sampling_${err.code.toLowerCase()}`,
      message: err.message,
      ...(err.cause && typeof err.cause === 'object' ? { debug: err.cause as Record<string, unknown> } : {})
    }
  }
  return { error: 'unexpected_error', message: (err as Error)?.message ?? String(err) }
}
