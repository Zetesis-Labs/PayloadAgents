'use client'

import { useState } from 'react'
import { useChat } from './chat-context.js'
import { cn } from '../lib/utils.js'
import { ChevronDown, Check, MessageSquarePlus, History, ChevronLeft } from 'lucide-react'
import { ChatHistoryList } from './ChatHistoryList.js'

interface ChatMenuDropdownProps {
  title: string
  onNewConversation: () => void
}

const ChatMenuDropdown = ({ title, onNewConversation }: ChatMenuDropdownProps) => {
  const {
    agents,
    selectedAgent,
    setSelectedAgent,
    // History props
    sessionsHistory,
    isLoadingHistory,
    loadHistory,
    loadSession,
    renameSession,
    deleteSession,
    conversationId
  } = useChat()
  const [isOpen, setIsOpen] = useState(false)
  const [pendingAgentSlug, setPendingAgentSlug] = useState<string | null>(null)
  const [menuView, setMenuView] = useState<'main' | 'history'>('main')

  // Import History List (using dynamic import might be cleaner but inline here is fine if imported at top)
  // Assuming ChatHistoryList is imported at top. If not, I need to add import.

  const handleNewConversationClick = () => {
    onNewConversation()
    setIsOpen(false)
  }

  const handleAgentSelect = (agentSlug: string) => {
    if (agentSlug === selectedAgent) {
      setIsOpen(false)
      return
    }
    setPendingAgentSlug(agentSlug)
  }

  const confirmAgentChange = () => {
    if (pendingAgentSlug) {
      setSelectedAgent(pendingAgentSlug)
      onNewConversation()
      setPendingAgentSlug(null)
      setIsOpen(false)
    }
  }

  const cancelAgentChange = () => {
    setPendingAgentSlug(null)
  }

  const handleOpenHistory = () => {
    setMenuView('history')
  }

  const handleBackToMenu = () => {
    setMenuView('main')
  }

  const handleSelectHistorySession = async (id: string) => {
    await loadSession(id)
    setIsOpen(false)
  }

  // Reset view when closing
  const toggleOpen = () => {
    if (isOpen) {
      setIsOpen(false)
      // Small delay to reset view after animation could be nice, but instant is fine
      setTimeout(() => setMenuView('main'), 200)
    } else {
      setIsOpen(true)
    }
  }

  // Find current agent name for title
  const currentAgent = agents.find(a => a.slug === selectedAgent)
  const displayTitle = currentAgent?.name || currentAgent?.slug || title
  const pendingAgent = agents.find(a => a.slug === pendingAgentSlug)

  return (
    <>
      <div className="relative">
        <button
          onClick={toggleOpen}
          className="flex items-center gap-2 text-xl font-bold text-foreground hover:text-foreground/80 transition-colors"
          aria-label="Menú de chat"
        >
          <span>{displayTitle}</span>
          <ChevronDown className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")} />
        </button>

        {isOpen && (
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-40" onClick={toggleOpen} />

            {/* Dropdown */}
            <div className="absolute top-full left-0 mt-2 z-50 min-w-[16rem] max-w-[20rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
              {menuView === 'main' ? (
                <>
                  <button
                    onClick={handleNewConversationClick}
                    className="relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <MessageSquarePlus className="w-4 h-4" />
                    Nueva conversación
                  </button>

                  <button
                    onClick={handleOpenHistory}
                    className="relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <History className="w-4 h-4" />
                    Historial de chats
                  </button>

                  {agents.length > 1 && (
                    <>
                      <div className="-mx-1 my-1 h-px bg-border" />
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Cambiar Agente
                      </div>
                      {agents.map((agent) => (
                        <button
                          key={agent.slug}
                          onClick={() => handleAgentSelect(agent.slug)}
                          className={cn(
                            "relative flex w-full cursor-pointer select-none items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground",
                            selectedAgent === agent.slug && "text-primary font-medium bg-primary/10"
                          )}
                        >
                          <span className="truncate">{agent.name || agent.slug}</span>
                          {selectedAgent === agent.slug && <Check className="w-4 h-4 flex-shrink-0" />}
                        </button>
                      ))}
                    </>
                  )}
                </>
              ) : (
                <div className="flex flex-col max-h-[60vh]">
                  <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border mb-1">
                    <button
                      onClick={handleBackToMenu}
                      className="p-1 hover:bg-accent rounded-sm"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-semibold">Historial</span>
                  </div>

                  <div className="overflow-y-auto custom-scrollbar p-1">
                    <ChatHistoryList
                      sessions={sessionsHistory}
                      activeSessionId={conversationId}
                      isLoading={isLoadingHistory}
                      onSelectSession={handleSelectHistorySession}
                      onRenameSession={renameSession}
                      onDeleteSession={deleteSession}
                      onLoadHistory={loadHistory}
                      agents={agents}
                    />
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Confirmation Dialog */}
      {pendingAgentSlug && (
        <>
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={cancelAgentChange} />
          <div className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md border border-border bg-background p-6 shadow-lg rounded-xl">
            <h3 className="text-lg font-semibold">¿Cambiar a {pendingAgent?.name || pendingAgent?.slug}?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Se iniciará una nueva conversación con este agente. La conversación actual se guardará en el historial.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={cancelAgentChange}
                className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                Cancelar
              </button>
              <button
                onClick={confirmAgentChange}
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
              >
                Sí, cambiar
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}

export default ChatMenuDropdown
