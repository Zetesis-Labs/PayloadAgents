/**
 * Embedding generation seam.
 *
 * pgvector — unlike Typesense — does NOT auto-embed: vectors must be produced
 * app-side before they hit the database. `EmbeddingProvider` is the abstraction
 * that does it. The default implementation talks to any OpenAI-compatible
 * `/v1/embeddings` endpoint, so it works against OpenAI directly, a LiteLLM
 * gateway, a local TEI/Ollama server, etc. — the package stays generic and the
 * consumer points `baseUrl` wherever it routes embeddings.
 */
export interface EmbeddingProvider {
  /**
   * Stable identifier of the model the vectors are produced with. Index-time and
   * query-time MUST use the same model + dimensions, or similarity is garbage.
   */
  readonly model: string

  /** Dimensionality of the produced vectors (must match the `vector(N)` column). */
  readonly dimensions: number

  /** Embed a batch of texts. Order of the returned vectors matches the input. */
  embed(texts: string[]): Promise<number[][]>
}

export interface OpenAICompatibleEmbeddingConfig {
  /** Base URL of an OpenAI-compatible API, e.g. `http://litellm:4000/v1`. */
  baseUrl: string
  /** API key / virtual key sent as `Authorization: Bearer`. */
  apiKey: string
  /** Model name / alias to request, e.g. `embeddings-dev`. */
  model: string
  /** Vector dimensionality. Must match the target `vector(N)` column. */
  dimensions: number
  /**
   * Send `dimensions` in the request body so a reduced-dim config produces
   * vectors that fit the `vector(N)` column. Only the OpenAI `text-embedding-3-*`
   * family (and gateways proxying them) honour it — ada-002, TEI, Ollama and
   * most local servers reject the param, so this is OFF by default. Enable it
   * only when the target model supports dimensionality reduction.
   */
  sendDimensions?: boolean
  /** Optional fetch implementation override (testing). Defaults to global fetch. */
  fetchImpl?: typeof fetch
}

interface OpenAIEmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>
}

/**
 * EmbeddingProvider backed by an OpenAI-compatible `/embeddings` endpoint.
 */
export class OpenAICompatibleEmbeddingProvider implements EmbeddingProvider {
  readonly model: string
  readonly dimensions: number
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly sendDimensions: boolean
  private readonly fetchImpl: typeof fetch

  constructor(config: OpenAICompatibleEmbeddingConfig) {
    this.model = config.model
    this.dimensions = config.dimensions
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.apiKey = config.apiKey
    this.sendDimensions = config.sendDimensions ?? false
    this.fetchImpl = config.fetchImpl ?? fetch
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return []

    const response = await this.fetchImpl(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      // Request the configured dimensionality only when the target model honours
      // it (text-embedding-3-*); other backends reject the param. See sendDimensions.
      body: JSON.stringify({
        model: this.model,
        input: texts,
        ...(this.sendDimensions ? { dimensions: this.dimensions } : {})
      }),
      // Bound the request: a hung gateway must not block CMS saves or boot.
      signal: AbortSignal.timeout(30_000)
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Embedding request failed (${response.status} ${response.statusText}): ${detail}`)
    }

    const json = (await response.json()) as OpenAIEmbeddingResponse
    // Fail loudly on a misaligned batch: callers pair vectors to inputs by
    // position, so a short/over-long response would mispair text↔vector (or push
    // an `undefined` vector downstream). Require one embedding per input.
    if (!Array.isArray(json.data) || json.data.length !== texts.length) {
      throw new Error(`Embedding response count mismatch: requested ${texts.length}, got ${json.data?.length ?? 0}`)
    }
    // Preserve request order — some gateways return out-of-order by `index`.
    return [...json.data].sort((a, b) => a.index - b.index).map(item => item.embedding)
  }
}
