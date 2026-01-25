import type { MutableRefObject } from 'react'

export interface Source {
    id: string
    title: string
    slug: string
    type: 'article' | 'book'
    chunkIndex: number
    relevanceScore: number
    content: string
    excerpt?: string
}

export interface Message {
    role: 'user' | 'assistant'
    content: string
    timestamp: Date
    sources?: Source[]
}

export interface SessionSummary {
    conversation_id: string
    title?: string
    last_activity: string
    status: string
    agentSlug?: string
}

export interface PublicAgentInfo {
    slug: string
    name: string
    welcomeTitle?: string
    welcomeSubtitle?: string
    suggestedQuestions?: Array<{
        prompt: string
        title: string
        description: string
    }>
    avatar?: string
}

export interface TokenUsage {
    limit: number
    used: number
    remaining: number
    percentage: number
    reset_at: string
}

export interface SendMessageContext {
    conversationId: string | null
    selectedDocuments: string[] // IDs
    agentSlug?: string | null
}

export interface StreamCallbacks {
    onConversationId?: (id: string) => void
    onToken?: (token: string) => void
    onSources?: (sources: Source[]) => void
    onDone?: () => void
    onUsage?: (usage: any) => void // TODO: Type this properly if possible
    onError?: (error: Error) => void
}

export interface ChatAdapter {
    // Runtime & Streaming
    sendMessage(
        message: string,
        context: SendMessageContext,
        callbacks: StreamCallbacks,
        signal?: AbortSignal
    ): Promise<void>

    // Session Management
    getActiveSession(): Promise<{ conversationId: string; messages: Message[] } | null>
    getHistory(): Promise<SessionSummary[]>
    loadSession(id: string): Promise<{ conversationId: string; messages: Message[] } | null>
    renameSession(id: string, newTitle: string): Promise<boolean>
    deleteSession(id: string): Promise<boolean>

    // Agents
    getAgents(): Promise<PublicAgentInfo[]>
}
