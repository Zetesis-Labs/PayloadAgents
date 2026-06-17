import { randomUUID } from 'node:crypto'
import { NexusQueueClient } from '@zetesis/nexus-queue'
import type { Endpoint, PayloadRequest } from 'payload'
import type { DocumentsWorkerConfig } from '../plugin/types'
import { fetchUploadedFile, getLlamaParseClient } from './inline-helpers'
import { type EndpointConfig, fetchDocument, getRouteId, requireAuth, updateDocument } from './shared'

const DEFAULT_TASK_NAME = 'documents.parse'

export const createParseEndpoint = (config: EndpointConfig): Endpoint => ({
  path: '/:id/parse',
  method: 'post',
  handler: async (req: PayloadRequest) => {
    const authError = requireAuth(req)
    if (authError) return authError

    const idOrError = getRouteId(req)
    if (idOrError instanceof Response) return idOrError
    const id = idOrError

    if (config.worker) {
      return queueOnWorker(req, config.collectionSlug, id, config.worker)
    }

    return runInline(req, config, id)
  }
})

const queueOnWorker = async (
  req: PayloadRequest,
  collectionSlug: string,
  id: string,
  worker: DocumentsWorkerConfig
): Promise<Response> => {
  await updateDocument(req, collectionSlug, id, {
    parse_status: 'pending',
    parse_error: null,
    parse_job_id: null
  })

  const queue = new NexusQueueClient({ kickerUrl: worker.url, secret: worker.internalSecret })

  try {
    // Per-attempt idempotency key: dedupes a redelivery of THIS enqueue, but a
    // static `id` would block intentional reprocessing (a re-parse) for the
    // dedup TTL. Each POST /parse is a fresh attempt.
    const idempotencyKey = `${id}:${randomUUID()}`
    await queue.enqueue(worker.taskName ?? DEFAULT_TASK_NAME, { document_id: id }, { idempotencyKey })
    return Response.json({ status: 'queued' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Worker is unreachable'
    await updateDocument(req, collectionSlug, id, {
      parse_status: 'error',
      parse_error: message
    })
    return Response.json({ error: message }, { status: 502 })
  }
}

const runInline = async (req: PayloadRequest, config: EndpointConfig, id: string): Promise<Response> => {
  const clientOrError = getLlamaParseClient(config)
  if (clientOrError instanceof Response) return clientOrError
  const client = clientOrError

  const docOrError = await fetchDocument(req, config.collectionSlug, id)
  if (docOrError instanceof Response) return docOrError
  const doc = docOrError

  const fileOrError = await fetchUploadedFile(req, doc)
  if (fileOrError instanceof Response) return fileOrError
  const { blob, filename } = fileOrError

  try {
    const job = await client.upload(blob, filename, {
      language: doc.language ?? undefined,
      parsingInstruction: doc.parsing_instruction ?? undefined,
      mode: doc.mode ?? undefined
    })

    await updateDocument(req, config.collectionSlug, id, {
      parse_job_id: job.id,
      parse_status: 'pending',
      parse_error: null
    })

    return Response.json({ job_id: job.id, status: 'pending' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'LlamaParse upload failed'
    await updateDocument(req, config.collectionSlug, id, {
      parse_status: 'error',
      parse_error: message
    })
    return Response.json({ error: message }, { status: 500 })
  }
}
