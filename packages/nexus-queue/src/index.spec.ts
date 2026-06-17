import { describe, expect, it, vi } from 'vitest'
import { NexusQueueClient, NexusQueueError } from './index'

const ok = (body: unknown, status = 202): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })

describe('NexusQueueClient', () => {
  it('posts the envelope body with the secret header and trims the kicker URL', async () => {
    let capturedUrl: string | undefined
    let capturedInit: RequestInit | undefined
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      capturedUrl = String(input)
      capturedInit = init
      return Promise.resolve(ok({ status: 'queued', task: 'zp.documents.parse', task_id: 't-1' }))
    })

    const client = new NexusQueueClient({
      kickerUrl: 'http://worker:8001/',
      secret: 's3cret',
      fetch: fetchMock
    })

    const result = await client.enqueue('zp.documents.parse', { document_id: 'doc-1' }, { idempotencyKey: 'doc-1' })

    expect(capturedUrl).toBe('http://worker:8001/enqueue/zp.documents.parse')
    expect(capturedInit?.method).toBe('POST')
    expect((capturedInit?.headers as Record<string, string>)['X-Nexus-Secret']).toBe('s3cret')
    expect(JSON.parse(capturedInit?.body as string)).toEqual({
      payload: { document_id: 'doc-1' },
      tenant: '_',
      idempotency_key: 'doc-1',
      priority: 'default',
      trace: null
    })
    expect(result).toEqual({ status: 'queued', task: 'zp.documents.parse', taskId: 't-1' })
  })

  it('url-encodes the task name in the path', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(ok({ status: 'queued', task: 'a/b', task_id: 'x' })))
    const client = new NexusQueueClient({ kickerUrl: 'http://w', secret: 's', fetch: fetchMock })

    await client.enqueue('a/b', {})

    expect(fetchMock).toHaveBeenCalledWith('http://w/enqueue/a%2Fb', expect.anything())
  })

  it('throws NexusQueueError carrying the HTTP status on a non-2xx response', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(new Response('Forbidden', { status: 403 })))
    const client = new NexusQueueClient({ kickerUrl: 'http://w', secret: 'bad', fetch: fetchMock })

    await expect(client.enqueue('t', {})).rejects.toThrowError(NexusQueueError)
    await expect(client.enqueue('t', {})).rejects.toMatchObject({ status: 403 })
  })
})
