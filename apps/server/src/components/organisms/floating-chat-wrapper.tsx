'use client'

import { FloatingChatManager } from '@nexo-labs/chat-agent'
import { useUser } from '@/components/organisms/user-context'
import Link from 'next/link'
import Image from 'next/image'

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
