import { ChatAdapter, Message, PublicAgentInfo, SendMessageContext, SessionSummary, StreamCallbacks } from './ChatAdapter.js'

export class NexoPayloadChatAdapter implements ChatAdapter {
    async sendMessage(
        message: string,
        context: SendMessageContext,
        callbacks: StreamCallbacks,
        signal?: AbortSignal
    ): Promise<void> {
        const requestBody: Record<string, unknown> = {
            message: message,
            agentSlug: context.agentSlug || undefined,
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
                signal,
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

    private async processStream(
        response: Response,
        callbacks: StreamCallbacks
    ) {
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
                if (!line.startsWith('data: ')) continue

                const data = line.slice(6)
                if (data === '[DONE]') {
                    streamDone = true
                    break
                }

                try {
                    const event = JSON.parse(data)

                    switch (event.type) {
                        case 'conversation_id':
                            callbacks.onConversationId?.(event.data)
                            break

                        case 'token':
                            callbacks.onToken?.(event.data)
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
                            callbacks.onUsage?.(event.data)
                            break

                        case 'error':
                            throw new Error(event.data?.error || 'Streaming error')
                    }
                } catch (e) {
                    if (!(e instanceof SyntaxError)) throw e
                    // If JSON parse fails, it might be a partial line, but here we are checking whole lines
                    console.warn('Failed to parse SSE event:', data)
                }
            }
        }
    }

    async getActiveSession(): Promise<{ conversationId: string; messages: Message[] } | null> {
        try {
            const response = await fetch('/api/chat/session?active=true')
            if (response.ok) {
                const sessionData = await response.json()
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
                return data.sessions || []
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
                body: JSON.stringify({ title: newTitle }),
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
                method: 'DELETE',
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

    private parseBackendMessages(backendMessages: any[]): Message[] {
        if (!backendMessages) return []
        return backendMessages.map((msg: any) => ({
            role: msg.role,
            content: msg.content,
            timestamp: new Date(msg.timestamp),
            sources: msg.sources?.map((s: any) => ({
                id: s.id,
                title: s.title,
                slug: s.slug,
                type: s.type || 'article',
                chunkIndex: s.chunk_index || 0,
                relevanceScore: 0,
                content: '',
            })),
        }))
    }
}
