'use client'

import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import type { FC } from 'react'

interface ThinkingIndicatorProps {
  message?: string
  className?: string
}

/**
 * Visual indicator while the AI processes a request
 * Features a double-ring spinner with opposite rotations and sparkles icon
 */
export const ThinkingIndicator: FC<ThinkingIndicatorProps> = ({
  message = 'El Oraculo esta pensando...',
  className
}) => {
  return (
    <motion.div
      className={`flex flex-col items-center justify-center gap-4 py-8 ${className || ''}`}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.3 }}
    >
      {/* Double ring spinner */}
      <div className="relative w-16 h-16">
        {/* Outer ring - clockwise */}
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary/60 border-r-primary/30"
          animate={{ rotate: 360 }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: 'linear'
          }}
        />
        {/* Inner ring - counter-clockwise */}
        <motion.div
          className="absolute inset-2 rounded-full border-2 border-transparent border-b-primary/60 border-l-primary/30"
          animate={{ rotate: -360 }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'linear'
          }}
        />
        {/* Center sparkles icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.7, 1, 0.7]
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut'
            }}
          >
            <Sparkles className="w-6 h-6 text-primary" />
          </motion.div>
        </div>
      </div>

      {/* Message text */}
      <motion.p
        className="text-sm text-muted-foreground"
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        {message}
      </motion.p>
    </motion.div>
  )
}

export default ThinkingIndicator
