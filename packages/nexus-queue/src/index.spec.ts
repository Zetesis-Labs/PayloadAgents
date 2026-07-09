import { beforeEach, describe, expect, it, vi } from 'vitest'

// Capture what the client publishes without a real NATS server.
const publish = vi.fn<(subject: string, data: Uint8Array, opts?: { msgID?: string }) => Promise<unknown>>(() =>
  Promise.resolve({})
)
const drain = vi.fn(() => Promise.resolve())
const connect = vi.fn(() => Promise.resolve({ jetstream: () => ({ publish }), drain }))

vi.mock('nats', () => ({ connect }))

const { NexusQueueClient, NexusQueueError, workSubject } = await import('./index')

const decodePublished = (): { subject: string; message: Record<string, unknown>; msgID?: string } => {
  const [subject, data, opts] = publish.mock.calls[0]
  return { subject, message: JSON.parse(new TextDecoder().decode(data)), msgID: opts?.msgID }
}

describe('NexusQueueClient', () => {
  beforeEach(() => {
    publish.mockClear()
    connect.mockClear()
    drain.mockClear()
  })

  it('publishes a standard envelope to the queue work subject', async () => {
    const client = new NexusQueueClient({ natsUrl: 'nats://n:4222', project: 'zp', queue: 'documents' })

    const result = await client.enqueue(
      'zp.documents.parse',
      { document_id: 'doc-1' },
      { idempotencyKey: 'doc-1:v3', tenant: 't5', priority: 'high', trace: '00-abc-def-01' }
    )

    const { subject, message, msgID } = decodePublished()
    expect(subject).toBe('nq.zp.documents')
    expect(msgID).toBe('doc-1:v3')
    expect(message.task_name).toBe('zp.documents.parse')
    expect(message.kwargs).toEqual({ document_id: 'doc-1' })
    expect(message.labels).toMatchObject({
      nq_v: '1',
      nq_task: 'zp.documents.parse',
      nq_tenant: 't5',
      nq_priority: 'high',
      nq_idem: 'doc-1:v3',
      nq_trace: '00-abc-def-01'
    })
    expect((message.labels as Record<string, string>).nq_enqueued_at).toEqual(expect.any(String))
    expect(result).toMatchObject({ status: 'queued', task: 'zp.documents.parse' })
    expect(result.taskId).toMatch(/^[0-9a-f]{32}$/)
  })

  it('defaults tenant/priority and omits optional labels when unset', async () => {
    const client = new NexusQueueClient({ natsUrl: 'nats://n:4222', project: 'zp', queue: 'documents' })
    await client.enqueue('t', {})

    const { message, msgID } = decodePublished()
    const labels = message.labels as Record<string, string>
    expect(labels.nq_tenant).toBe('_')
    expect(labels.nq_priority).toBe('default')
    expect(labels.nq_idem).toBeUndefined()
    expect(labels.nq_trace).toBeUndefined()
    // No idempotency key → Nats-Msg-Id falls back to the task id.
    expect(msgID).toMatch(/^[0-9a-f]{32}$/)
  })

  it('reuses one connection across enqueues', async () => {
    const client = new NexusQueueClient({ natsUrl: 'nats://n:4222', project: 'zp', queue: 'documents' })
    await client.enqueue('t', {})
    await client.enqueue('t', {})
    expect(connect).toHaveBeenCalledTimes(1)
  })

  it('wraps a publish failure in NexusQueueError', async () => {
    publish.mockRejectedValueOnce(new Error('no stream'))
    const client = new NexusQueueClient({ natsUrl: 'nats://n:4222', project: 'zp', queue: 'documents' })
    await expect(client.enqueue('t', {})).rejects.toThrowError(NexusQueueError)
  })

  it('builds the subject from project + queue', () => {
    expect(workSubject('nixon', 'jobs')).toBe('nq.nixon.jobs')
  })
})
