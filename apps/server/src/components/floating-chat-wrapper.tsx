'use client'

import {
  type AgentChatDataSource,
  type AgentInfo,
  FloatingChatWrapper as AgentFloatingChat,
  type SessionSummary
} from '@zetesis/agent-ui'
import Image from 'next/image'
import Link from 'next/link'

// Concrete AgentChatDataSource backed by the agent plugin's /api/chat/* endpoints
// (registered by `agentPlugin` with basePath '/chat'). Mirrors the ZetesisPortal
// wiring; the playground has no tenant roles, so access is granted to any
// authenticated user (the endpoints themselves enforce auth → 401 when logged out).
const dataSource: AgentChatDataSource = {
  getAgents: async () => {
    const res = await fetch('/api/chat/agents')
    if (!res.ok) throw new Error('Failed to load agents')
    const data = (await res.json()) as { agents?: AgentInfo[] }
    return data.agents ?? []
  },
  getRecentSessions: async (agentSlug, limit = 10) => {
    const params = new URLSearchParams()
    if (agentSlug) params.set('agentSlug', agentSlug)
    params.set('limit', String(limit))
    const res = await fetch(`/api/chat/sessions?${params.toString()}`)
    if (!res.ok) throw new Error('Failed to load sessions')
    const data = (await res.json()) as { sessions?: SessionSummary[] }
    return data.sessions ?? []
  },
  getSession: async conversationId => {
    const res = await fetch(`/api/chat/session?conversationId=${encodeURIComponent(conversationId)}`)
    if (!res.ok) throw new Error('Failed to load session')
    return await res.json()
  },
  renameSession: async (conversationId, title) => {
    const res = await fetch(`/api/chat/session?conversationId=${encodeURIComponent(conversationId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    })
    if (!res.ok) throw new Error('Failed to rename session')
  },
  deleteSession: async conversationId => {
    const res = await fetch(`/api/chat/session?conversationId=${encodeURIComponent(conversationId)}`, {
      method: 'DELETE'
    })
    if (!res.ok) throw new Error('Failed to delete session')
  }
}

export function FloatingChatWrapper() {
  return (
    <AgentFloatingChat
      hasAccess
      dataSource={dataSource}
      chatEndpoint="/api/chat"
      LinkComponent={Link}
      ImageComponent={Image}
    />
  )
}
