'use client'

import { FloatingChatManager } from '@nexo-labs/chat-agent'
import Image from 'next/image'
import Link from 'next/link'
import { useUser } from '@/components/organisms/user-context'

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Wrapper component that bridges Next.js server/client boundary
 * This allows us to use Next.js optimizations (Link, Image) while keeping
 * the chat-agent package portable
 */
export function FloatingChatWrapper() {
  return (
    <FloatingChatManager
      useUser={useUser}
      generateHref={({ type, value }) => `/${type}/${value.slug || value.id}`}
      LinkComponent={Link}
      ImageComponent={Image}
    />
  )
}
