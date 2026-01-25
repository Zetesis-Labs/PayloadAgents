'use client'
import React, { useState, useEffect } from 'react'
import { MoreHorizontal, MessageSquare, Trash2, Edit2, Check, X, Loader2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '../lib/utils.js'
import { SessionSummary } from '../hooks/useChatSession.js'
import { PublicAgentInfo } from '../adapters/ChatAdapter.js'

interface ChatHistoryListProps {
    sessions: SessionSummary[]
    activeSessionId: string | null
    isLoading: boolean
    onSelectSession: (id: string) => void
    onRenameSession: (id: string, newTitle: string) => Promise<boolean>
    onDeleteSession: (id: string) => Promise<boolean>
    onLoadHistory: () => Promise<void>
    agents?: PublicAgentInfo[]
}

export const ChatHistoryList = ({
    sessions,
    activeSessionId,
    isLoading,
    onSelectSession,
    onRenameSession,
    onDeleteSession,
    onLoadHistory,
    agents = [],
}: ChatHistoryListProps) => {
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editTitle, setEditTitle] = useState('')
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

    // Helper to get agent name from slug
    const getAgentName = (agentSlug?: string) => {
        if (!agentSlug) return null
        const agent = agents.find(a => a.slug === agentSlug)
        return agent?.name || null
    }

    useEffect(() => {
        onLoadHistory()
    }, [])

    const handleStartEdit = (session: SessionSummary, e: React.MouseEvent) => {
        e.stopPropagation()
        setEditingId(session.conversation_id)
        setEditTitle(session.title || 'Nueva conversación')
        setMenuOpenId(null)
    }

    const handleSaveEdit = async (e: React.MouseEvent | React.FormEvent) => {
        e.stopPropagation()
        if (!editingId) return

        await onRenameSession(editingId, editTitle)
        setEditingId(null)
    }

    const handleCancelEdit = (e: React.MouseEvent) => {
        e.stopPropagation()
        setEditingId(null)
    }

    const handleDeleteClick = (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        setDeletingId(id)
        setMenuOpenId(null)
    }

    const handleConfirmDelete = async (e: React.MouseEvent) => {
        e.stopPropagation()
        if (deletingId) {
            await onDeleteSession(deletingId)
            setDeletingId(null)
        }
    }

    const handleCancelDelete = (e: React.MouseEvent) => {
        e.stopPropagation()
        setDeletingId(null)
    }

    const toggleMenu = (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        setMenuOpenId(menuOpenId === id ? null : id)
    }

    if (isLoading && sessions.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mb-2" />
                <span className="text-sm">Cargando historial...</span>
            </div>
        )
    }

    if (sessions.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <MessageSquare className="h-8 w-8 mb-2 opacity-20" />
                <span className="text-sm">No hay conversaciones anteriores</span>
            </div>
        )
    }

    return (
        <div className="space-y-1">
            {sessions.map((session, index) => (
                <div
                    key={session.conversation_id}
                    className={cn(
                        "group relative flex items-center rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent/50 cursor-pointer",
                        activeSessionId === session.conversation_id ? "bg-accent text-accent-foreground" : "text-foreground"
                    )}
                    onClick={() => onSelectSession(session.conversation_id)}
                >
                    <MessageSquare className="mr-2 h-4 w-4 opacity-70 flex-shrink-0" />

                    {editingId === session.conversation_id ? (
                        <div className="flex items-center flex-1 gap-1" onClick={e => e.stopPropagation()}>
                            <input
                                type="text"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                className="h-6 flex-1 rounded-sm border border-input bg-transparent px-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveEdit(e)
                                    if (e.key === 'Escape') {
                                        setEditingId(null)
                                        setEditTitle('')
                                    }
                                }}
                            />
                            <button onClick={handleSaveEdit} className="p-1 hover:text-green-500"><Check className="h-3 w-3" /></button>
                            <button onClick={handleCancelEdit} className="p-1 hover:text-red-500"><X className="h-3 w-3" /></button>
                        </div>
                    ) : deletingId === session.conversation_id ? (
                        <div className="flex items-center flex-1 justify-between bg-destructive/10 -mx-2 px-2 py-1 rounded">
                            <span className="text-xs text-destructive font-medium">¿Borrar?</span>
                            <div className="flex gap-1">
                                <button onClick={handleConfirmDelete} className="p-1 text-destructive hover:bg-destructive/20 rounded"><Check className="h-3 w-3" /></button>
                                <button onClick={handleCancelDelete} className="p-1 text-muted-foreground hover:bg-black/5 rounded"><X className="h-3 w-3" /></button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="flex-1 overflow-hidden">
                                <div className="truncate font-medium">
                                    {session.title || 'Conversación sin título'}
                                </div>
                                {(() => {
                                    const agentName = getAgentName(session.agentSlug)
                                    return agentName && (
                                        <div className="truncate text-xs text-primary/80 font-medium">
                                            {agentName}
                                        </div>
                                    )
                                })()}
                                <div className="truncate text-xs text-muted-foreground opacity-70">
                                    {formatDistanceToNow(new Date(session.last_activity), { addSuffix: true, locale: es })}
                                </div>
                            </div>

                            <div className="relative flex items-center">
                                {menuOpenId === session.conversation_id ? (
                                    <div className="flex items-center gap-1 animate-in fade-in slide-in-from-right-4 duration-200 bg-background/80 backdrop-blur-sm rounded-md p-1 pl-2 ml-[-8px]">
                                        <button
                                            onClick={(e) => handleStartEdit(session, e)}
                                            className="p-1.5 text-foreground/70 hover:text-foreground hover:bg-accent rounded-sm transition-colors"
                                            title="Renombrar"
                                        >
                                            <Edit2 className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                            onClick={(e) => handleDeleteClick(session.conversation_id, e)}
                                            className="p-1.5 text-destructive/70 hover:text-destructive hover:bg-destructive/10 rounded-sm transition-colors"
                                            title="Eliminar"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setMenuOpenId(null) }}
                                            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-sm transition-colors"
                                            title="Cerrar menú"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={(e) => toggleMenu(session.conversation_id, e)}
                                        className={cn(
                                            "ml-1 rounded p-1 text-muted-foreground hover:bg-accent transition-all",
                                            "opacity-70 group-hover:opacity-100"
                                        )}
                                        title="Opciones"
                                    >
                                        <MoreHorizontal className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </div>
            ))}
        </div>
    )
}
