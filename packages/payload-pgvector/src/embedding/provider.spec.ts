import { describe, expect, it, vi } from 'vitest'
import { OpenAICompatibleEmbeddingProvider } from './provider'

function fakeFetch() {
  return vi.fn(
    async () =>
      new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2], index: 0 }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
  )
}

const base = {
  baseUrl: 'http://litellm:4000/v1/',
  apiKey: 'sk-test',
  model: 'embeddings-dev',
  dimensions: 1536
}

describe('OpenAICompatibleEmbeddingProvider', () => {
  it('omits dimensions by default (TEI/Ollama/ada-002 reject the param)', async () => {
    const fetchImpl = fakeFetch()
    const provider = new OpenAICompatibleEmbeddingProvider({ ...base, fetchImpl })

    await provider.embed(['hello'])

    const body = JSON.parse((fetchImpl.mock.calls[0]?.[1] as { body: string }).body)
    expect(body).not.toHaveProperty('dimensions')
    expect(body).toMatchObject({ model: 'embeddings-dev', input: ['hello'] })
    // trailing slash on baseUrl is trimmed
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('http://litellm:4000/v1/embeddings')
  })

  it('sends dimensions only when sendDimensions is enabled', async () => {
    const fetchImpl = fakeFetch()
    const provider = new OpenAICompatibleEmbeddingProvider({ ...base, sendDimensions: true, fetchImpl })

    await provider.embed(['hello'])

    const body = JSON.parse((fetchImpl.mock.calls[0]?.[1] as { body: string }).body)
    expect(body.dimensions).toBe(1536)
  })

  it('returns [] without calling fetch for an empty batch', async () => {
    const fetchImpl = fakeFetch()
    const provider = new OpenAICompatibleEmbeddingProvider({ ...base, fetchImpl })

    await expect(provider.embed([])).resolves.toEqual([])
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('reorders vectors by the response index', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              { embedding: [2], index: 1 },
              { embedding: [1], index: 0 }
            ]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    )
    const provider = new OpenAICompatibleEmbeddingProvider({ ...base, fetchImpl })

    await expect(provider.embed(['a', 'b'])).resolves.toEqual([[1], [2]])
  })
})
