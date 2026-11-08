import { type AgnoMessage, extractMessagesFromRuns, parseAgnoRuns } from '@zetesis/payload-agents-core'
import { sql } from 'drizzle-orm'
import type { PayloadHandler } from 'payload'
import { getDrizzle } from '../lib/db'
import type { ResolvedMetricsConfig } from '../types'

interface ToolCallOut {
  id: string
  name: string
  input: Record<string, unknown>
  result?: string
  sources?: Array<{ id: string; title: string; slug: string; type: string }>
}

interface MappedMessage {
  role: string
  content: string
  toolCalls?: ToolCallOut[]
  sources?: Array<{ id: string; title: string; slug: string; type: string }>
}

let toonDecodePromise: Promise<((s: string) => unknown) | null> | null = null
function getToonDecode(): Promise<((s: string) => unknown) | null> {
  if (!toonDecodePromise) {
    toonDecodePromise = import('@toon-format/toon')
      .then(mod => (mod as { decode: (s: string) => unknown }).decode)
      .catch(err => {
        console.warn('[metrics] @toon-format/toon failed to load; tool-call sources disabled:', err)
        return null
      })
  }
  return toonDecodePromise
}

function pickString(record: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = record[k]
    if (typeof v === 'string' && v.length > 0) return v
    if (typeof v === 'number') return String(v)
  }
  return ''
}

async function extractSources(
  result: unknown
): Promise<Array<{ id: string; title: string; slug: string; type: string }>> {
  if (typeof result !== 'string') return []
  const decode = await getToonDecode()
  if (!decode) return []
  try {
    const data = decode(result)
    let hits: unknown[]
    if (Array.isArray(data)) {
      hits = data
    } else if (data && typeof data === 'object' && 'hits' in data && Array.isArray(data.hits)) {
      hits = data.hits
    } else {
      return []
    }
    const sources: Array<{ id: string; title: string; slug: string; type: string }> = []
    for (const h of hits) {
      if (!h || typeof h !== 'object' || !('chunk_id' in h)) continue
      const it = h as Record<string, unknown>
      sources.push({
        id: pickString(it, 'chunk_id'),
        title: pickString(it, 'title', 'document_title'),
        slug: pickString(it, 'slug', 'document_slug'),
        type: (pickString(it, 'collection') || 'posts_chunk').replace(/_chunk$/, '')
      })
    }
    return sources
  } catch (err) {
    console.warn('[metrics] Failed to extract tool-call sources:', err instanceof Error ? err.message : err)
    return []
  }
}

function buildToolResultsMap(messages: AgnoMessage[]): Map<string, AgnoMessage> {
  const map = new Map<string, AgnoMessage>()
  for (const m of messages) {
    if (m.role === 'tool' && m.tool_call_id) map.set(m.tool_call_id, m)
  }
  return map
}

function parseToolInput(args: string): Record<string, unknown> {
  try {
    return JSON.parse(args) as Record<string, unknown>
  } catch {
    return {}
  }
}

async function buildToolCallsFromMessage(
  message: AgnoMessage,
  toolResults: Map<string, AgnoMessage>
): Promise<ToolCallOut[]> {
  const out: ToolCallOut[] = []
  for (const tc of message.tool_calls ?? []) {
    const input = parseToolInput(tc.function.arguments)
    const toolResult = toolResults.get(tc.id)
    const resultContent = toolResult?.content || undefined
    const sources = resultContent ? await extractSources(resultContent) : []
    out.push({
      id: tc.id,
      name: tc.function.name,
      input,
      result: resultContent,
      sources: sources.length > 0 ? sources : undefined
    })
  }
  return out
}

function dedupeSources(toolCalls: ToolCallOut[]): Array<{ id: string; title: string; slug: string; type: string }> {
  const all = toolCalls.flatMap(t => t.sources ?? [])
  return [...new Map(all.map(s => [s.id, s])).values()]
}

function buildAssistantMessage(content: string, pendingToolCalls: ToolCallOut[]): MappedMessage {
  const sources = dedupeSources(pendingToolCalls)
  return {
    role: 'assistant',
    content,
    toolCalls: pendingToolCalls.length > 0 ? pendingToolCalls : undefined,
    sources: sources.length > 0 ? sources : undefined
  }
}

async function mapMessages(allMessages: AgnoMessage[]): Promise<MappedMessage[]> {
  const result: MappedMessage[] = []
  const toolResults = buildToolResultsMap(allMessages)

  let pendingToolCalls: ToolCallOut[] = []
  for (const m of allMessages) {
    if (m.role === 'user') {
      result.push({ role: 'user', content: m.content || '' })
      pendingToolCalls = []
      continue
    }
    if (m.role === 'assistant' && !m.content && m.tool_calls?.length) {
      pendingToolCalls.push(...(await buildToolCallsFromMessage(m, toolResults)))
      continue
    }
    if (m.role === 'assistant' && m.content) {
      result.push(buildAssistantMessage(m.content, pendingToolCalls))
      pendingToolCalls = []
    }
  }
  if (pendingToolCalls.length > 0) {
    result.push(buildAssistantMessage('', pendingToolCalls))
  }
  return result
}

export function createSessionDetailHandler(config: ResolvedMetricsConfig): PayloadHandler {
  return async req => {
    const { user, payload } = req
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const access = await config.checkAccess(payload, user)
    if (!access) return Response.json({ error: 'Forbidden' }, { status: 403 })

    const url = new URL(req.url || '', 'http://localhost')
    const conversationId = url.searchParams.get('conversationId')
    if (!conversationId) return Response.json({ error: 'conversationId is required' }, { status: 400 })

    // Enforce tenant scoping: a tenant-scoped user must own at least one event
    // for this conversationId before we expose the agno run payload.
    if (!('allTenants' in access) && config.multiTenant) {
      const ownsConversation = await payload.count({
        collection: config.collectionSlug,
        where: {
          and: [{ conversationId: { equals: conversationId } }, { tenant: { in: access.tenantIds } }]
        },
        overrideAccess: true
      })
      if (ownsConversation.totalDocs === 0) {
        return Response.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const db = getDrizzle(payload)
    const result = await db.execute(sql`
      SELECT run_data FROM ${sql.raw(config.agnoRunsTable)}
      WHERE session_id = ${conversationId}
      ORDER BY run_index ASC NULLS LAST, created_at ASC
    `)

    const rawRuns: unknown[] = []
    for (const row of result.rows) {
      if (typeof row.run_data !== 'string') {
        rawRuns.push(row.run_data)
        continue
      }
      try {
        rawRuns.push(JSON.parse(row.run_data))
      } catch {
        // Skip the run so the rest of the transcript still renders, but leave a trace.
        payload.logger.warn({ conversationId }, '[metrics] session detail: skipping a run whose run_data is not JSON')
      }
    }

    const allMessages: AgnoMessage[] = extractMessagesFromRuns(parseAgnoRuns(rawRuns))
    return Response.json({ messages: await mapMessages(allMessages) })
  }
}
