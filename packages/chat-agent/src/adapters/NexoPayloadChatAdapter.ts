import type {
  ChatAdapter,
  Message,
  PublicAgentInfo,
  SendMessageContext,
  SessionSummary,
  Source,
  StreamCallbacks
} from './ChatAdapter'

interface SSEEvent {
  type: string
  data?: unknown
}

function handleSSEEvent(event: SSEEvent, callbacks: StreamCallbacks): void {
  switch (event.type) {
    case 'conversation_id':
      callbacks.onConversationId?.(event.data as string)
      break

    case 'token':
      callbacks.onToken?.(event.data as string)
      break

    case 'sources':
      if (Array.isArray(event.data)) {
        callbacks.onSources?.(event.data)
      }
      break

    case 'done':
      callbacks.onDone?.()
      break

    case 'usage':
      callbacks.onUsage?.(
        event.data as { daily_limit: number; daily_used: number; daily_remaining: number; reset_at: string }
      )
      break

    case 'error':
      handleSSEError(event)
      break
  }
}

function handleSSEError(event: SSEEvent): never {
  const errorData = event.data as Record<string, unknown> | undefined
  if (errorData?.error === 'EXPIRED_CONVERSATION') {
    const error = new Error((errorData?.message as string) || 'Esta conversación ha expirado') as Error & {
      code: string
      chatId: string
    }
    error.code = 'EXPIRED_CONVERSATION'
    error.chatId = errorData?.chatId as string
    throw error
  }
  throw new Error((errorData?.error as string) || 'Streaming error')
}

function parseSSELine(line: string): { done: boolean; event: SSEEvent | null } {
  if (!line.startsWith('data: ')) {
    return { done: false, event: null }
  }

  const data = line.slice(6)
  if (data === '[DONE]') {
    return { done: true, event: null }
  }

  try {
    const event = JSON.parse(data) as SSEEvent
    return { done: false, event }
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e
    console.warn('Failed to parse SSE event:', data)
    return { done: false, event: null }
  }
}

export class NexoPayloadChatAdapter implements ChatAdapter {
  async sendMessage(
    message: string,
    context: SendMessageContext,
    callbacks: StreamCallbacks,
    signal?: AbortSignal
  ): Promise<void> {
    const requestBody: Record<string, unknown> = {
      message: message,
      agentSlug: context.agentSlug || undefined
    }

    if (context.selectedDocuments.length > 0) {
      requestBody.selectedDocuments = context.selectedDocuments
    }

    if (context.conversationId) {
      requestBody.chatId = context.conversationId
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Error al procesar' }))

        // Handle 429
        if (response.status === 429 && errorData.limit_info && callbacks.onUsage) {
          callbacks.onUsage({
            daily_limit: errorData.limit_info.limit,
            daily_used: errorData.limit_info.used,
            daily_remaining: errorData.limit_info.remaining,
            reset_at: errorData.limit_info.reset_at
          })
          throw new Error(errorData.error || 'Has alcanzado tu límite diario de tokens.')
        }

        throw new Error(errorData.error || 'Error al procesar')
      }

      await this.processStream(response, callbacks)
    } catch (err) {
      if (callbacks.onError) {
        callbacks.onError(err instanceof Error ? err : new Error('Unknown error'))
      } else {
        throw err
      }
    }
  }

  private async processStream(response: Response, callbacks: StreamCallbacks) {
    const reader = response.body?.getReader()
    const decoder = new TextDecoder()

    if (!reader) throw new Error('No stream reader')

    let buffer = ''
    let streamDone = false

    while (!streamDone) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const result = parseSSELine(line)
        if (result.done) {
          streamDone = true
          break
        }
        if (result.event) {
          handleSSEEvent(result.event, callbacks)
        }
      }
    }
  }

  async getActiveSession(): Promise<{
    conversationId: string
    messages: Message[]
  } | null> {
    try {
      const response = await fetch('/api/chat/session?active=true')
      if (response.ok) {
        const sessionData = await response.json()
        // Don't load if session is closed/expired
        if (sessionData.status === 'closed') {
          console.warn('[NexoPayloadChatAdapter] Active session is closed/expired, clearing')
          return null
        }
        return {
          conversationId: sessionData.conversation_id,
          messages: this.parseBackendMessages(sessionData.messages)
        }
      }
      return null
    } catch (error) {
      console.error('[NexoPayloadChatAdapter] Error loading active session:', error)
      return null
    }
  }

  async getHistory(): Promise<SessionSummary[]> {
    try {
      const response = await fetch('/api/chat/sessions')
      if (response.ok) {
        const data = await response.json()
        const sessions = data.sessions || []
        // Filter out closed/expired sessions
        return sessions.filter((session: SessionSummary) => session.status === 'active')
      }
      return []
    } catch (error) {
      console.error('[NexoPayloadChatAdapter] Error loading history:', error)
      return []
    }
  }

  async loadSession(id: string): Promise<{ conversationId: string; messages: Message[] } | null> {
    try {
      const response = await fetch(`/api/chat/session?conversationId=${encodeURIComponent(id)}`)
      if (response.ok) {
        const sessionData = await response.json()
        // Don't load if session is closed/expired
        if (sessionData.status === 'closed') {
          console.warn('[NexoPayloadChatAdapter] Session is closed/expired:', id)
          return null
        }
        return {
          conversationId: sessionData.conversation_id,
          messages: this.parseBackendMessages(sessionData.messages)
        }
      }
      return null
    } catch (error) {
      console.error('[NexoPayloadChatAdapter] Error loading session:', error)
      return null
    }
  }

  async renameSession(id: string, newTitle: string): Promise<boolean> {
    try {
      const response = await fetch(`/api/chat/session?conversationId=${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle })
      })
      return response.ok
    } catch (error) {
      console.error('[NexoPayloadChatAdapter] Error renaming session:', error)
      return false
    }
  }

  async deleteSession(id: string): Promise<boolean> {
    try {
      const response = await fetch(`/api/chat/session?conversationId=${encodeURIComponent(id)}`, {
        method: 'DELETE'
      })
      return response.ok
    } catch (error) {
      console.error('[NexoPayloadChatAdapter] Error deleting session:', error)
      return false
    }
  }

  async getAgents(): Promise<PublicAgentInfo[]> {
    try {
      const response = await fetch('/api/chat/agents')
      if (response.ok) {
        const data = await response.json()
        return data.agents || []
      }
      return []
    } catch (error) {
      console.error('[NexoPayloadChatAdapter] Error loading agents:', error)
      return []
    }
  }

  private parseBackendMessages(backendMessages: Record<string, unknown>[]): Message[] {
    if (!backendMessages) return []
    return backendMessages.map((msg: Record<string, unknown>) => ({
      role: msg.role as Message['role'],
      content: msg.content as string,
      timestamp: new Date(msg.timestamp as string),
      sources: (msg.sources as Record<string, unknown>[])?.map((s: Record<string, unknown>) => ({
        id: s.id as string,
        title: s.title as string,
        slug: s.slug as string,
        type: (s.type as Source['type']) || 'article',
        chunkIndex: (s.chunk_index as number) || 0,
        relevanceScore: 0,
        content: ''
      }))
    }))
  }
}
