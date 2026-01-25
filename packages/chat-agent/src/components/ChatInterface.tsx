'use client'

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { useAssistantRuntime } from '../hooks/useAssistantRuntime.js'
import DocumentSelector from './DocumentSelector.js'
import { useChat } from './chat-context.js'
import { LinkComponent } from '../types/components.js'
import { Thread } from './assistant-ui/thread.js'

interface Document {
  id: string
  title: string
  slug: string
  type: 'article' | 'book'
  collection: string
}

export interface ChatInterfaceRef {
  handleNewConversation: () => void
}

interface ChatInterfaceProps {
  generateHref: (props: { type: string; value: { id: number; slug?: string | null } }) => string
  LinkComponent?: LinkComponent
}

const ChatInterface = forwardRef<ChatInterfaceRef, ChatInterfaceProps>(({ generateHref, LinkComponent }, ref) => {
  const {
    isMaximized,
    setMaximized,
    updateTokenUsage,
    selectedAgent,
    agents,
    // Session props from context
    conversationId,
    setConversationId,
    messages,
    setMessages,
    isLoadingSession,
    handleNewConversation,
    isLoadingAgents,
  } = useChat()
  const [selectedDocuments, setSelectedDocuments] = useState<Document[]>([])
  const [isDesktop, setIsDesktop] = useState(false)

  // Find the full agent configuration
  const currentAgent = agents.find(agent => agent.slug === selectedAgent)

  // Create assistant-ui runtime
  const runtime = useAssistantRuntime({
    messages,
    setMessages,
    conversationId,
    setConversationId,
    selectedDocuments,
    selectedAgent,
  })

  // Detect if device is desktop (window width >= 1024px)
  useEffect(() => {
    const checkIsDesktop = () => {
      setIsDesktop(window.innerWidth >= 1024)
    }

    checkIsDesktop()
    window.addEventListener('resize', checkIsDesktop)

    return () => window.removeEventListener('resize', checkIsDesktop)
  }, [])

  // Determine if we should use side panel layout
  const shouldUseSidePanel = isMaximized && isDesktop

  // Expose handleNewConversation to parent via ref
  useImperativeHandle(ref, () => ({
    handleNewConversation,
  }))

  // Show loading state while restoring session or loading agents
  if (isLoadingSession || isLoadingAgents || (agents.length > 0 && !selectedAgent)) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="flex space-x-2 justify-center mb-4">
            <div className="w-3 h-3 rounded-full bg-primary animate-bounce" />
            <div className="w-3 h-3 rounded-full bg-primary animate-bounce delay-75" />
            <div className="w-3 h-3 rounded-full bg-primary animate-bounce delay-150" />
          </div>
          <p className="text-muted-foreground">
            {isLoadingSession ? "Cargando conversación..." : "Cargando asistente..."}
          </p>
        </div>
      </div>
    )
  }

  // Show error/empty state if no agents loaded
  if (!isLoadingAgents && agents.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md p-6">
          <p className="text-lg font-medium text-muted-foreground mb-2">No hay asistentes disponibles</p>
          <p className="text-sm text-muted-foreground">
            Por favor, contacta con el administrador del sistema.
          </p>
        </div>
      </div>
    )
  }

  if (shouldUseSidePanel) {
    // Desktop maximized mode: Side panel layout (1/4 + 3/4)
    return (
      <div className="flex h-full">
        {/* Document Selector Side Panel (1/4 width) */}
        <div className="w-1/4 flex-shrink-0">
          <DocumentSelector
            onSelectionChange={setSelectedDocuments}
            isMaximized={isMaximized}
            isSidePanel={true}
          />
        </div>

        {/* Chat Area (3/4 width) */}
        <div className="flex-1 flex flex-col">
          <Thread
            runtime={runtime}
            welcomeTitle={currentAgent?.welcomeTitle || undefined}
            welcomeSubtitle={currentAgent?.welcomeSubtitle || undefined}
            suggestedQuestions={currentAgent?.suggestedQuestions}
            generateHref={generateHref}
            LinkComponent={LinkComponent}
            agentName={currentAgent?.name}
          />
        </div>
      </div>
    )
  }

  // Default layout: Mobile/tablet or desktop non-maximized (dropdown mode)
  return (
    <div className="flex flex-col h-full">
      {/* Document Selector */}
      <div className="border-b border-border p-4 bg-background">
        <DocumentSelector
          onSelectionChange={setSelectedDocuments}
          isMaximized={isMaximized}
          isSidePanel={false}
        />
      </div>

      {/* Chat Thread */}
      <div className="flex-1 min-h-0">
        <Thread
          runtime={runtime}
          welcomeTitle={currentAgent?.welcomeTitle || undefined}
          welcomeSubtitle={currentAgent?.welcomeSubtitle || undefined}
          suggestedQuestions={currentAgent?.suggestedQuestions}
          generateHref={generateHref}
          LinkComponent={LinkComponent}
          agentName={currentAgent?.name}
        />
      </div>
    </div>
  )
})

ChatInterface.displayName = 'ChatInterface'

export default ChatInterface
