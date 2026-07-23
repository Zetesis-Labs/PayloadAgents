/**
 * Tool: extract_claims
 *
 * LLM-powered extraction of discrete typed claims from a corpus document.
 * Single-phase (no reduce): each bundle independently yields claims which
 * are concatenated at the tool level, then citation-verified.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { ToolContext } from '../context'
import {
  buildUser,
  CLAIM_TYPES,
  type ClaimType,
  type ExtractClaimsOutput,
  outputSchema,
  SYSTEM
} from '../prompts/extract-claims'
import { bundleChunks, type PromptChunk, verifyCitations } from '../prompts/shared'
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

const DEFAULT_MAX_CHUNKS = 40
const MAX_MAX_CHUNKS = 100
const BUNDLE_TOKEN_BUDGET = 8000
const EXTRACT_MAX_TOKENS = 2000

export const extractClaimsSchema = z.object({
  collection: z.string().describe('Chunk collection name.'),
  parent_doc_id: z.string().describe('The parent document ID to extract claims from.'),
  start_chunk: z.number().int().min(0).optional().describe('Inclusive start of chunk_index range.'),
  end_chunk: z.number().int().min(0).optional().describe('Exclusive end of chunk_index range.'),
  max_chunks: z
    .number()
    .int()
    .min(1)
    .max(MAX_MAX_CHUNKS)
    .optional()
    .describe(`Hard cap on chunks processed. Default: ${DEFAULT_MAX_CHUNKS}. Max: ${MAX_MAX_CHUNKS}.`),
  types: z
    .array(z.enum(CLAIM_TYPES))
    .optional()
    .describe('Filter claims by type: factual, normative, definitional, predictive.'),
  max_claims_per_chunk: z.number().int().min(1).max(10).optional().describe('Budget per chunk. Default: 5.'),
  retrieval_profile: z
    .string()
    .optional()
    .describe(
      'Profile slug whose scope governs this read. Pass the SAME profile you searched with. Defaults to your default profile.'
    )
})

export type ExtractClaimsInput = z.infer<typeof extractClaimsSchema>

// ============================================================================
// RESULT TYPES
// ============================================================================

interface ExtractedClaim {
  text: string
  type: ClaimType
  chunk_id: string
  confidence: number
  verified: boolean
}

export interface ExtractClaimsSuccess {
  parent_doc_id: string
  collection: string
  title: string
  total_chunks_in_doc: number
  chunks_used: number
  types_filter?: ClaimType[]
  claims: ExtractedClaim[]
  model: string
  sampling_calls: number
  sampling_time_ms: number
}

export interface ExtractClaimsErrorResult {
  error: string
  message?: string
  [key: string]: unknown
}

export type ExtractClaimsResult = ExtractClaimsSuccess | ExtractClaimsErrorResult | SamplingNotSupportedError

// ============================================================================
// TOOL
// ============================================================================

export async function extractClaims(
  input: ExtractClaimsInput,
  ctx: ToolContext,
  auth: McpAuthContext | null,
  server: McpServer,
  signal?: AbortSignal
): Promise<ExtractClaimsResult> {
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
      reason: 'Fetch the raw chunks and extract claims yourself.'
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
      message: `No chunks found for parent_doc_id ${input.parent_doc_id} in ${input.collection}.`
    }
  }

  const maxChunks = input.max_chunks ?? DEFAULT_MAX_CHUNKS
  if (rangeTotal > maxChunks) {
    return {
      error: 'document_too_large',
      message: `Document has ${rangeTotal} chunks; max_chunks is ${maxChunks}.`,
      range_total: rangeTotal,
      max_chunks: maxChunks,
      hint: 'Pass start_chunk/end_chunk, lower the scope, or raise max_chunks (capped at 100 for extraction).'
    }
  }

  const passedIds = new Set(chunks.map(c => c.chunk_id))
  const bundles = bundleChunks(chunks, BUNDLE_TOKEN_BUDGET)

  const start = Date.now()
  try {
    const bundleResults = await runExtractionPhase(server, bundles, input, signal)
    const allClaims = bundleResults.flatMap(r => r.claims)
    const verified = verifyCitations(allClaims, passedIds).map(c => ({
      text: c.text,
      type: c.type,
      chunk_id: c.chunk_id,
      confidence: c.confidence,
      verified: c.verified
    }))

    return {
      parent_doc_id: input.parent_doc_id,
      collection: input.collection,
      title,
      total_chunks_in_doc: rangeTotal,
      chunks_used: chunks.length,
      ...(input.types ? { types_filter: input.types } : {}),
      claims: verified,
      model: bundleResults[0]?.model ?? 'unknown',
      sampling_calls: bundleResults.length,
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
  input: ExtractClaimsInput,
  ctx: ToolContext,
  auth: McpAuthContext | null
): Promise<FetchedChunks | ExtractClaimsErrorResult> {
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
  if ('error' in result) return { error: 'get_chunks_failed', message: result.error }
  const chunks: PromptChunk[] = result.chunks.map(c => ({
    chunk_id: c.id,
    chunk_index: c.chunk_index,
    chunk_text: c.chunk_text,
    headers: c.headers
  }))
  const title = result.chunks[0]?.title ?? ''
  return { chunks, rangeTotal: result.range_total, title }
}

async function runExtractionPhase(
  server: McpServer,
  bundles: PromptChunk[][],
  input: ExtractClaimsInput,
  signal: AbortSignal | undefined
): Promise<Array<ExtractClaimsOutput & { model: string }>> {
  return Promise.all(
    bundles.map(async bundle => {
      const res = await requestStructuredSampling<ExtractClaimsOutput>(
        server,
        {
          system: SYSTEM,
          user: buildUser(bundle, input.types, input.max_claims_per_chunk),
          maxTokens: EXTRACT_MAX_TOKENS,
          temperature: 0.2
        },
        outputSchema,
        signal
      )
      return { claims: res.data.claims, model: res.model }
    })
  )
}

function shapeSamplingError(err: unknown): ExtractClaimsErrorResult {
  if (err instanceof SamplingError) {
    return {
      error: `sampling_${err.code.toLowerCase()}`,
      message: err.message
    }
  }
  return { error: 'unexpected_error', message: (err as Error)?.message ?? String(err) }
}
