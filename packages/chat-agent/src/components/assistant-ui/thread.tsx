import {
    AssistantRuntimeProvider,
    ThreadPrimitive,
    ComposerPrimitive,
    MessagePrimitive,
    useMessageRuntime,
    useThreadRuntime,
} from "@assistant-ui/react"
import { ArrowUpIcon, SquareIcon, Sparkles, ArrowRight, AlertTriangle, X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { MarkdownText } from "./markdown-text.js"
import type { FC } from "react"
import { cn } from "../../lib/utils.js"
import { SourcesList } from "../SourcesList.js"
import { LinkComponent } from "../../types/components.js"
import type { Source } from "../../adapters/ChatAdapter.js"
import { createContext, useContext, useState, useEffect } from "react"
import { useChat } from "../chat-context.js"

interface ThreadContextValue {
    generateHref: (props: { type: string; value: { id: number; slug?: string | null } }) => string
    LinkComponent?: LinkComponent
    agentName?: string
}

const ThreadContext = createContext<ThreadContextValue | null>(null)

interface ThreadProps {
    runtime: ReturnType<typeof import("@assistant-ui/react").useExternalStoreRuntime>
    welcomeTitle?: string
    welcomeSubtitle?: string
    suggestedQuestions?: Array<{
        prompt: string
        title: string
        description: string
    }>
    generateHref: (props: { type: string; value: { id: number; slug?: string | null } }) => string
    LinkComponent?: LinkComponent
    agentName?: string
}

/**
 * Main Thread component styled for Oraculo de Escohotado
 */
export const Thread: FC<ThreadProps> = ({
    runtime,
    welcomeTitle,
    welcomeSubtitle,
    suggestedQuestions,
    generateHref,
    LinkComponent,
    agentName
}) => {
    return (
        <AssistantRuntimeProvider runtime={runtime}>
            <ThreadContext.Provider value={{ generateHref, LinkComponent, agentName }}>
                <ThreadPrimitive.Root className="flex h-full flex-col bg-background">
                    {/* Limit Error Alert */}
                    <LimitAlert />

                    <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-4 pt-4">
                        <ThreadPrimitive.Empty>
                            { welcomeTitle && welcomeSubtitle && <ThreadWelcome
                                title={welcomeTitle}
                                subtitle={welcomeSubtitle}
                                suggestedQuestions={suggestedQuestions}
                            /> }
                        </ThreadPrimitive.Empty>

                        <ThreadPrimitive.Messages
                            components={{
                                UserMessage,
                                AssistantMessage,
                            }}
                        />

                        <TypingIndicator />
                    </ThreadPrimitive.Viewport>

                    <div className="sticky bottom-0 border-t border-border bg-gradient-to-t from-background via-background to-background/80 backdrop-blur-sm">
                        {/* Token Usage Bar */}
                        <TokenUsageBar />
                        <div className="p-4 pt-2">
                            <Composer />
                        </div>
                    </div>
                </ThreadPrimitive.Root>
            </ThreadContext.Provider>
        </AssistantRuntimeProvider>
    )
}

interface ThreadWelcomeProps {
    title: string
    subtitle: string
    suggestedQuestions?: Array<{
        prompt: string
        title: string
        description: string
    }>
}

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1,
            delayChildren: 0.1
        }
    }
} as const

const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
        opacity: 1,
        y: 0,
        transition: {
            type: "spring" as const,
            stiffness: 300,
            damping: 24
        }
    }
}

const ThreadWelcome: FC<ThreadWelcomeProps> = ({ title, subtitle, suggestedQuestions }) => {
    if (!title) return null

    return (
        <motion.div
            className="flex h-full flex-col items-center justify-center p-4 max-w-2xl mx-auto"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
        >
            <motion.div className="text-center mb-8 space-y-3" variants={itemVariants}>
                <motion.div
                    className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4"
                    animate={{
                        rotate: [0, 5, -5, 0],
                        scale: [1, 1.05, 1]
                    }}
                    transition={{
                        duration: 4,
                        repeat: Infinity,
                        ease: "easeInOut"
                    }}
                >
                    <Sparkles className="w-8 h-8 text-primary" />
                </motion.div>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                    {title}
                </h1>
                <p className="text-lg text-muted-foreground">
                    {subtitle}
                </p>
            </motion.div>

            {suggestedQuestions && suggestedQuestions.length > 0 && (
                <motion.div
                    className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full"
                    variants={containerVariants}
                >
                    {suggestedQuestions.map((question, index) => (
                        <SuggestionCard
                            key={index}
                            prompt={question.prompt}
                            title={question.title}
                            description={question.description}
                        />
                    ))}
                </motion.div>
            )}
        </motion.div>
    )
}

interface SuggestionCardProps {
    prompt: string
    title: string
    description: string
}

const SuggestionCard: FC<SuggestionCardProps> = ({ prompt, title, description }) => {
    return (
        <motion.div variants={itemVariants}>
            <ThreadPrimitive.Suggestion
                prompt={prompt}
                className="group relative flex flex-col items-start gap-1 rounded-xl border border-border bg-card p-4 text-start cursor-pointer overflow-hidden transition-colors duration-200 hover:border-primary/30"
            >
                <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent"
                    initial={{ x: "-100%" }}
                    whileHover={{ x: 0 }}
                    transition={{ duration: 0.3 }}
                />
                <div className="relative flex items-center justify-between w-full">
                    <span className="font-medium text-sm text-foreground">{title}</span>
                    <motion.div
                        initial={{ opacity: 0, x: -10 }}
                        whileHover={{ opacity: 1, x: 0 }}
                        className="text-primary"
                    >
                        <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </motion.div>
                </div>
                <span className="relative text-xs text-muted-foreground">{description}</span>
            </ThreadPrimitive.Suggestion>
        </motion.div>
    )
}

/**
 * Alert shown when token limit is exceeded
 */
const LimitAlert: FC = () => {
    const { limitError, setLimitError, tokenUsage } = useChat()

    if (!limitError) return null

    const resetTime = tokenUsage?.reset_at
        ? new Date(tokenUsage.reset_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        : null

    return (
        <motion.div
            className="mx-4 mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
        >
            <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium text-destructive">{limitError}</p>
                    {resetTime && (
                        <p className="text-xs text-muted-foreground">
                            Tu límite se restablecerá a las {resetTime}
                        </p>
                    )}
                </div>
                <button
                    onClick={() => setLimitError(null)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
        </motion.div>
    )
}

/**
 * Token usage progress bar
 */
const TokenUsageBar: FC = () => {
    const { tokenUsage } = useChat()

    if (!tokenUsage) return null

    const percentage = Math.min(tokenUsage.percentage, 100)
    const isWarning = percentage > 50
    const isCritical = percentage > 80

    const getGradientClass = () => {
        if (isCritical) return 'from-red-500 to-red-600'
        if (isWarning) return 'from-yellow-500 to-orange-500'
        return 'from-primary to-primary/80'
    }

    return (
        <div className="px-4 py-2 border-b border-border/50">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>
                    {tokenUsage.used.toLocaleString()} / {tokenUsage.limit.toLocaleString()} tokens
                </span>
                <span>{percentage.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                <motion.div
                    className={cn("h-full rounded-full bg-gradient-to-r", getGradientClass())}
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                />
            </div>
        </div>
    )
}

const TypingIndicator: FC = () => {
    const threadRuntime = useThreadRuntime()
    const [isRunning, setIsRunning] = useState(false)
    const context = useContext(ThreadContext)

    useEffect(() => {
        // Subscribe to thread state changes
        const unsubscribe = threadRuntime.subscribe(() => {
            const state = threadRuntime.getState()
            setIsRunning(state.isRunning)
        })

        // Check initial state
        setIsRunning(threadRuntime.getState().isRunning)

        return unsubscribe
    }, [threadRuntime])

    const agentName = context?.agentName || "El asistente"

    return (
        <AnimatePresence>
            {isRunning && (
                <motion.div
                    className="flex justify-start py-4 w-full"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                >
                    <div className="max-w-[85%] rounded-2xl rounded-bl-md border-l-4 border-l-primary/30 bg-card/80 backdrop-blur-sm px-5 py-4 text-card-foreground shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1">
                                <span className="typing-dot w-2 h-2 rounded-full bg-primary/60" />
                                <span className="typing-dot w-2 h-2 rounded-full bg-primary/60" />
                                <span className="typing-dot w-2 h-2 rounded-full bg-primary/60" />
                            </div>
                            <span className="text-sm text-muted-foreground">
                                {agentName} está pensando...
                            </span>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}

const Composer: FC = () => {
    return (
        <ComposerPrimitive.Root className="flex w-full items-end max-w-4xl mx-auto">
            <motion.div
                className="relative flex w-full flex-col rounded-3xl border border-input bg-background/50 px-4 py-2 shadow-sm transition-all focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50"
                style={{
                    "--tw-shadow": "var(--shadow-glow-primary)"
                } as React.CSSProperties}
                whileFocus={{ scale: 1.01 }}
            >
                <ComposerPrimitive.Input
                    placeholder="Escribe tu pregunta..."
                    className="w-full resize-none border-none bg-transparent px-2 py-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus:ring-0 max-h-[200px] min-h-[52px] pr-12"
                    rows={1}
                    autoFocus
                />

                <div className="absolute bottom-3 right-3 flex items-center justify-center p-1">
                    <ComposerPrimitive.Send asChild>
                        <motion.button
                            type="submit"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/25 transition-all disabled:opacity-50 disabled:shadow-none"
                            aria-label="Enviar mensaje"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                        >
                            <motion.div
                                animate={{ y: [0, -2, 0] }}
                                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                            >
                                <ArrowUpIcon className="h-5 w-5" />
                            </motion.div>
                        </motion.button>
                    </ComposerPrimitive.Send>

                    <ComposerPrimitive.Cancel asChild>
                        <motion.button
                            type="button"
                            className="hidden data-[running=true]:inline-flex h-9 w-9 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm transition-all"
                            aria-label="Cancelar"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                        >
                            <SquareIcon className="h-3 w-3 fill-current" />
                        </motion.button>
                    </ComposerPrimitive.Cancel>
                </div>
            </motion.div>
        </ComposerPrimitive.Root>
    )
}

const UserMessage: FC = () => {
    return (
        <MessagePrimitive.Root className="flex justify-end py-2 w-full">
            <motion.div
                className="max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground shadow-md shadow-primary/20"
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{
                    type: "spring",
                    stiffness: 400,
                    damping: 25
                }}
            >
                <MessagePrimitive.Content
                    components={{
                        Text: ({ text }) => <span className="whitespace-pre-wrap font-medium">{text}</span>,
                    }}
                />
            </motion.div>
        </MessagePrimitive.Root>
    )
}

const AssistantMessage: FC = () => {
    const messageRuntime = useMessageRuntime()
    const context = useContext(ThreadContext)

    // Extract sources from metadata with type-safe access
    const messageState = messageRuntime.getState()
    const metadata = messageState.metadata as { custom?: { sources?: Source[] } } | undefined
    const sources = metadata?.custom?.sources

    return (
        <MessagePrimitive.Root className="flex justify-start py-4 w-full">
            <motion.div
                className="max-w-[85%] rounded-2xl rounded-bl-md border-l-4 border-l-primary/30 bg-card/80 backdrop-blur-sm px-5 py-4 text-card-foreground shadow-sm"
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{
                    type: "spring",
                    stiffness: 400,
                    damping: 25
                }}
            >
                <MessagePrimitive.Content
                    components={{
                        Text: MarkdownText,
                    }}
                />

                {sources && sources.length > 0 && context && (
                    <SourcesList
                        sources={sources}
                        generateHref={context.generateHref}
                        LinkComponent={context.LinkComponent}
                    />
                )}
            </motion.div>
        </MessagePrimitive.Root>
    )
}

export { ThreadWelcome, Composer, UserMessage, AssistantMessage, TypingIndicator }
