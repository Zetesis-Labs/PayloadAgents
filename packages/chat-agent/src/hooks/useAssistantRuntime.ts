'use client'

import { type AppendMessage, type ThreadMessage, useExternalStoreRuntime } from '@assistant-ui/react'
import { useCallback, useMemo, useState } from 'react'
import type { Message, Source } from '../adapters/ChatAdapter'
import { useChat } from '../components/chat-context'

interface Document {
  id: string
  title: string
  slug: string
  type: 'article' | 'book'
  collection: string
}

interface UseAssistantRuntimeProps {
  messages: Message[]
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  conversationId: string | null
  setConversationId: (id: string | null) => void
  selectedDocuments: Document[]
  selectedAgent: string | null
}

/**
 * Convert internal messages to assistant-ui format
 * Only includes the custom metadata field with sources
 */
function toThreadMessages(messages: Message[]): ThreadMessage[] {
  return messages.map((msg, index) => {
    // Only include custom metadata - other fields are optional and should be undefined
    const metadata = {
      custom: msg.sources ? { sources: msg.sources } : {}
    }

    if (msg.role === 'user') {
      return {
        id: `msg-${index}`,
        role: 'user' as const,
        content: [{ type: 'text' as const, text: msg.content }],
        createdAt: msg.timestamp,
        attachments: [],
        metadata
      }
    }

    return {
      id: `msg-${index}`,
      role: 'assistant' as const,
      content: [{ type: 'text' as const, text: msg.content }],
      createdAt: msg.timestamp,
      status: { type: 'complete' as const, reason: 'stop' as const },
      attachments: [],
      metadata
    }
  }) as ThreadMessage[]
}

/**
 * Hook that creates an assistant-ui runtime from existing chat hooks
 */
export function useAssistantRuntime({
  messages,
  setMessages,
  conversationId,
  setConversationId,
  selectedDocuments,
  selectedAgent
}: UseAssistantRuntimeProps) {
  const { updateTokenUsage, setLimitError, adapter, loadHistory } = useChat()
  const [isRunning, setIsRunning] = useState(false)
  const threadMessages = useMemo(() => toThreadMessages(messages), [messages])

  const onNew = useCallback(
    async (message: AppendMessage) => {
      // Extract text content from the message
      const textContent = message.content
        .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
        .map(part => part.text)
        .join('')

      if (!textContent.trim()) return

      // Set loading state
      setIsRunning(true)

      // Add user message and placeholder for assistant response in a single update
      const userMessage: Message = {
        role: 'user',
        content: textContent.trim(),
        timestamp: new Date()
      }

      setMessages(prev => [
        ...prev,
        userMessage,
        {
          role: 'assistant',
          content: '',
          timestamp: new Date()
        }
      ])

      let accumulatedContent = ''
      let receivedSources: Source[] = []

      try {
        // Use adapter to send message
        await adapter.sendMessage(
          textContent.trim(),
          {
            conversationId,
            selectedDocuments: selectedDocuments.map(doc => doc.id),
            agentSlug: selectedAgent
          },
          {
            onConversationId: id => setConversationId(id),
            onToken: token => {
              accumulatedContent += token
              setMessages(prev => {
                const updated = [...prev]
                const lastIdx = updated.length - 1
                if (lastIdx >= 0 && updated[lastIdx]?.role === 'assistant') {
                  updated[lastIdx] = {
                    ...updated[lastIdx],
                    content: accumulatedContent
                  }
                }
                return updated
              })
            },
            onSources: sources => {
              receivedSources = sources
              setMessages(prev => {
                const updated = [...prev]
                const lastIdx = updated.length - 1
                if (lastIdx >= 0 && updated[lastIdx]?.role === 'assistant') {
                  updated[lastIdx] = { ...updated[lastIdx], sources: sources }
                }
                return updated
              })
            },
            onUsage: usage => {
              if (usage) {
                updateTokenUsage({
                  limit: usage.daily_limit,
                  used: usage.daily_used,
                  remaining: usage.daily_remaining,
                  percentage: usage.daily_limit > 0 ? (usage.daily_used / usage.daily_limit) * 100 : 0,
                  reset_at: usage.reset_at
                })
              }
            },
            onDone: () => {
              // Final update to ensure consistency
              setMessages(prev => {
                const updated = [...prev]
                const lastIdx = updated.length - 1
                if (lastIdx >= 0 && updated[lastIdx]?.role === 'assistant') {
                  updated[lastIdx] = {
                    ...updated[lastIdx],
                    content: accumulatedContent,
                    sources: updated[lastIdx].sources || receivedSources
                  }
                }
                return updated
              })
            },
            onError: error => {
              throw error
            }
          }
        )

        // Clear any previous limit error
        setLimitError(null)
      } catch (err: any) {
        console.error('[useAssistantRuntime] Error:', err)

        // Handle expired conversation error
        if (err.code === 'EXPIRED_CONVERSATION') {
          console.warn('[useAssistantRuntime] Conversation expired:', err.chatId)

          // Replace placeholder with error message
          setMessages(prev => {
            const updated = [...prev]
            const lastIdx = updated.length - 1
            if (lastIdx >= 0 && updated[lastIdx]?.role === 'assistant') {
              updated[lastIdx] = {
                ...updated[lastIdx],
                content: `⚠️ **Conversación Expirada**\n\n${err.message}\n\nLas conversaciones expiran después de 24 horas de inactividad por motivos de seguridad y privacidad.`
              }
            }
            return updated
          })

          // Clear conversation ID so user can start a new conversation
          setConversationId(null)

          // Reload history to remove expired conversation from sidebar
          if (loadHistory) {
            loadHistory().catch(console.error)
          }

          return
        }

        // Handle 429 - Token limit exceeded (propagated from adapter)
        if (err.message === 'Has alcanzado tu límite diario de tokens.') {
          setLimitError(err.message)
          // Remove placeholder message
          setMessages(prev => prev.slice(0, -1))
          return
        }

        // Remove placeholder on other errors
        setMessages(prev => prev.slice(0, -1))
      } finally {
        // Clear loading state
        setIsRunning(false)
      }
    },
    [
      setMessages,
      conversationId,
      setConversationId,
      selectedDocuments,
      selectedAgent,
      setLimitError,
      updateTokenUsage,
      adapter
    ]
  )

  const runtime = useExternalStoreRuntime({
    messages: threadMessages,
    isRunning,
    onNew
  })

  return runtime
}
