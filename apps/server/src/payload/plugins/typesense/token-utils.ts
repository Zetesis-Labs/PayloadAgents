/**
 * Token Calculator and Cost Estimator
 * Utility functions for calculating token usage and estimating costs for AI services
 */

// ============================================================================
// TYPES
// ============================================================================

export type ServiceType = 'openai_embedding' | 'openai_llm' | 'gemini_embedding' | 'gemini_llm'

export interface TokenUsage {
  input?: number
  output?: number
  total: number
}

export interface SpendingEntry {
  service: ServiceType
  model: string
  tokens: TokenUsage
  cost_usd?: number
  timestamp: string
}

// ============================================================================
// PRICING
// ============================================================================

const PRICING = {
  // OpenAI models
  'text-embedding-3-large': {
    input: 0.00013 / 1000, // per token
  },
  'gpt-4o-mini': {
    input: 0.15 / 1_000_000, // per token
    output: 0.60 / 1_000_000, // per token
  },
  'openai/gpt-4o-mini': {
    input: 0.15 / 1_000_000,
    output: 0.60 / 1_000_000,
  },
  // Gemini models (pricing as of Jan 2025)
  'text-embedding-004': {
    input: 0, // Free tier
  },
  'gemini-embedding-001': {
    input: 0, // Free tier
  },
  'gemini-2.0-flash': {
    input: 0.10 / 1_000_000, // $0.10 per 1M input tokens
    output: 0.40 / 1_000_000, // $0.40 per 1M output tokens
  },
  'google/gemini-2.0-flash': {
    input: 0.10 / 1_000_000,
    output: 0.40 / 1_000_000,
  },
  'gemini-1.5-flash': {
    input: 0.075 / 1_000_000,
    output: 0.30 / 1_000_000,
  },
  'google/gemini-1.5-flash': {
    input: 0.075 / 1_000_000,
    output: 0.30 / 1_000_000,
  },
} as const

type ModelName = keyof typeof PRICING

// ============================================================================
// FUNCTIONS
// ============================================================================

/**
 * Calculate the cost in USD for a given model and token usage
 */
function calculateCost(model: string, tokens: TokenUsage): number {
  const pricing = PRICING[model as ModelName]

  if (!pricing) {
    console.warn(`[Token Calculator] No pricing data for model: ${model}`)
    return 0
  }

  let cost = 0

  // For models with input/output pricing (LLMs)
  if ('input' in pricing && 'output' in pricing) {
    cost += (tokens.input || 0) * pricing.input
    cost += (tokens.output || 0) * pricing.output
  }
  // For models with only input pricing (embeddings)
  else if ('input' in pricing) {
    cost += tokens.total * pricing.input
  }

  return cost
}

/**
 * Determine the service type based on model name
 */
function getEmbeddingServiceType(model: string): ServiceType {
  if (model.includes('gemini') || model.includes('text-embedding-004')) {
    return 'gemini_embedding'
  }
  return 'openai_embedding'
}

/**
 * Create a spending entry for embedding operations
 */
export function createEmbeddingSpending(
  model: string,
  tokens: number,
  timestamp?: Date
): SpendingEntry {
  const tokenUsage: TokenUsage = {
    input: tokens,
    total: tokens,
  }

  return {
    service: getEmbeddingServiceType(model),
    model,
    tokens: tokenUsage,
    cost_usd: calculateCost(model, tokenUsage),
    timestamp: (timestamp || new Date()).toISOString(),
  }
}

/**
 * Estimate tokens from text length (rough approximation: 1 token ~ 4 characters)
 */
export function estimateTokensFromText(text: string): number {
  return Math.ceil(text.length / 4)
}
