'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { MessageCircle } from 'lucide-react'
import { cn } from '../../lib/utils'

interface FloatingChatButtonProps {
  onOpen: () => void
  aiIcon?: string
  isOpen?: boolean
  className?: string
  ImageComponent?: any
}

export const FloatingChatButton = ({
  onOpen,
  aiIcon,
  isOpen = false,
  className,
  ImageComponent = (props: any) => <img {...props} />,
}: FloatingChatButtonProps) => {
  return (
    <AnimatePresence>
      {!isOpen && (
        <motion.button
          onClick={onOpen}
          className={cn(
            "fixed bottom-6 left-6 z-50 h-[60px] w-[60px] rounded-full shadow-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 overflow-hidden animate-pulse-glow",
            !aiIcon && "bg-primary text-primary-foreground flex items-center justify-center",
            className
          )}
          initial={{ scale: 0, rotate: -180, opacity: 0 }}
          animate={{
            scale: 1,
            rotate: 0,
            opacity: 1,
          }}
          exit={{
            scale: 0,
            rotate: 180,
            opacity: 0,
            transition: { duration: 0.3, ease: "easeInOut" }
          }}
          transition={{
            type: "spring" as const,
            stiffness: 260,
            damping: 20,
          }}
          whileHover={{
            scale: 1.08,
            boxShadow: "var(--shadow-glow-lg)"
          }}
          whileTap={{ scale: 0.95 }}
          aria-label="Abrir chat"
        >
          {aiIcon ? (
            <motion.div
              className="h-full w-full rounded-full p-[3px]"
              style={{ background: 'var(--chat-border-color)' }}
              animate={{
                opacity: [0.85, 1, 0.85]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            >
              <div className="h-full w-full rounded-full overflow-hidden bg-background">
                <ImageComponent
                  src={aiIcon}
                  alt="Chat Avatar"
                  className="h-full w-full object-cover"
                  width={60}
                  height={60}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              animate={{
                scale: [1, 1.1, 1],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            >
              <MessageCircle className="w-8 h-8" />
            </motion.div>
          )}
        </motion.button>
      )}
    </AnimatePresence>
  )
}

export default FloatingChatButton
