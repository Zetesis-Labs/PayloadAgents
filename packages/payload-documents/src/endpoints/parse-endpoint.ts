import { NexusQueueClient } from '@zetesis/nexus-queue'
import type { Endpoint, PayloadRequest } from 'payload'
import type { DocumentsWorkerConfig } from '../plugin/types'
import { fetchUploadedFile, getLlamaParseClient } from './inline-helpers'
import { type EndpointConfig, fetchDocument, getRouteId, requireAuth, updateDocument } from './shared'

const DEFAULT_TASK_NAME = 'documents.parse'

// One NATS connection per worker config, reused across requests (opening one
// per enqueue would handshake JetStream every parse). The worker config object
// is created once at plugin init and lives for the process, so keying the
// client off it gives a natural process-lifetime singleton without globals.
const clientByWorker = new WeakMap<DocumentsWorkerConfig, NexusQueueClient>()

const queueClient = (worker: DocumentsWorkerConfig): NexusQueueClient => {
  let client = clientByWorker.get(worker)
  if (!client) {
    client = new NexusQueueClient({ natsUrl: worker.natsUrl, project: worker.project, queue: worker.queue })
    clientByWorker.set(worker, client)
  }
  return client
}

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
  // Capture the document's version BEFORE flipping it to pending (that write
  // bumps updatedAt). This keys the job per *logical* parse, not per attempt:
  // two racing POSTs for the same unchanged doc dedup to a single run (broker
  // Nats-Msg-Id + worker nq_idem), while a genuine re-parse — the doc changed,
  // so updatedAt moved — gets a fresh key and runs. A per-attempt random key
  // (the old behaviour) made both dedup layers inert.
  const existing = await fetchDocument(req, collectionSlug, id)
  if (existing instanceof Response) return existing
  const version = existing.updatedAt ?? id
  // Scope the job to its tenant (multi-tenant deploys) so idempotency claims are
  // namespaced per tenant on the worker; undefined falls back to the single-
  // tenant sentinel in the client.
  const tenant = existing.tenant != null ? String(existing.tenant) : undefined

  await updateDocument(req, collectionSlug, id, {
    parse_status: 'pending',
    parse_error: null,
    parse_job_id: null
  })

  const queue = queueClient(worker)

  try {
    const idempotencyKey = `${id}:${version}`
    await queue.enqueue(worker.taskName ?? DEFAULT_TASK_NAME, { document_id: id }, { idempotencyKey, tenant })
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
