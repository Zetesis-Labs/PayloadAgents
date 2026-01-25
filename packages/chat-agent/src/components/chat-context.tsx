'use client'

import { createContext, useContext, useState, ReactNode, useEffect, useCallback, useMemo } from 'react'
import { useChatSession } from '../hooks/useChatSession.js'
import type { Message, SessionSummary } from '../adapters/ChatAdapter.js'
import { ChatAdapter, PublicAgentInfo, TokenUsage } from '../adapters/ChatAdapter.js'
import { NexoPayloadChatAdapter } from '../adapters/NexoPayloadChatAdapter.js'

interface AgentsResponse {
  agents: PublicAgentInfo[]
}

interface ChatContextType {
  adapter: ChatAdapter
  isPanelOpen: boolean
  isMaximized: boolean
  openPanel: () => void
  closePanel: () => void
  setMaximized: (value: boolean) => void
  tokenUsage: TokenUsage | null
  isLoadingTokens: boolean
  updateTokenUsage: (newUsage: Partial<TokenUsage>) => void
  // Limit error (when 429 is received)
  limitError: string | null
  setLimitError: (error: string | null) => void
  // Agent management
  agents: PublicAgentInfo[]
  selectedAgent: string | null
  setSelectedAgent: (slug: string) => void
  isLoadingAgents: boolean
  // Session & History (from useChatSession)
  conversationId: string | null
  setConversationId: (id: string | null) => void
  messages: Message[]
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  isLoadingSession: boolean
  handleNewConversation: () => Promise<void>
  sessionsHistory: SessionSummary[]
  isLoadingHistory: boolean
  loadHistory: () => Promise<void>
  loadSession: (conversationId: string) => Promise<void>
  renameSession: (conversationId: string, newTitle: string) => Promise<boolean>
  deleteSession: (conversationId: string) => Promise<boolean>
}

const ChatContext = createContext<ChatContextType | undefined>(undefined)

export const ChatProvider = ({ children, adapter: customAdapter }: { children: ReactNode; adapter?: ChatAdapter }) => {
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)

  // Initialize adapter (memoize default to avoid re-creation)
  const adapter = useMemo(() => customAdapter || new NexoPayloadChatAdapter(), [customAdapter])

  // Use session hook with adapter
  const chatSession = useChatSession(adapter)

  // Token usage management - lazy loaded from SSE events
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null)
  const [limitError, setLimitError] = useState<string | null>(null)
  const isLoadingTokens = false // No initial fetch needed

  // Agent management
  const [agents, setAgents] = useState<PublicAgentInfo[]>([])
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [isLoadingAgents, setIsLoadingAgents] = useState(false)

  // Load agents on mount
  useEffect(() => {
    const loadAgents = async () => {
      try {
        setIsLoadingAgents(true)
        const loadedAgents = await adapter.getAgents()
        setAgents(loadedAgents)
        if (loadedAgents.length > 0 && !selectedAgent) {
          setSelectedAgent(loadedAgents[0]?.slug || null)
        }
      } catch (error) {
        console.error('[ChatContext] Error loading agents:', error)
      } finally {
        setIsLoadingAgents(false)
      }
    }

    loadAgents()
  }, [adapter])

  // Check if device is mobile or tablet (not desktop)
  const isMobileOrTablet = () => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < 1024 // Tailwind lg breakpoint
  }

  const openPanel = () => {
    setIsPanelOpen(true)
    // Auto-maximize on mobile and tablet
    if (isMobileOrTablet()) {
      setIsMaximized(true)
    }
  }

  const closePanel = () => {
    setIsPanelOpen(false)
    setIsMaximized(false)
  }

  const setMaximized = (value: boolean) => setIsMaximized(value)

  // Update token usage (called from SSE events)
  // Memoized to prevent infinite loops in useEffect dependencies
  const updateTokenUsage = useCallback((newUsage: Partial<TokenUsage>) => {
    setTokenUsage((prev) => {
      if (!prev) {
        // First time: create full object from partial
        return newUsage as TokenUsage
      }
      // Subsequent updates: merge
      return {
        ...prev,
        ...newUsage,
      }
    })
  }, [])

  // Block body scroll when chat is maximized and open
  useEffect(() => {
    // Restore scroll when not maximized OR not open
    if (!isMaximized || !isPanelOpen) {
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
      return
    }

    // Save current scroll position
    const scrollY = window.scrollY

    // Prevent body scroll
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'

    return () => {
      // Restore body scroll
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''

      // Restore scroll position
      window.scrollTo(0, scrollY)
    }
  }, [isMaximized, isPanelOpen])

  return (
    <ChatContext.Provider
      value={{
        adapter,
        isPanelOpen,
        isMaximized,
        openPanel,
        closePanel,
        setMaximized,
        tokenUsage,
        isLoadingTokens,
        updateTokenUsage,
        limitError,
        setLimitError,
        agents,
        selectedAgent,
        setSelectedAgent,
        isLoadingAgents,
        ...chatSession // Spread useChatSession return values
      }}
    >
      {children}
    </ChatContext.Provider>
  )
}

export const useChat = () => {
  const context = useContext(ChatContext)
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider')
  }
  return context
}

