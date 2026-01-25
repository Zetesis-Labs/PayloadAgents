'use client'

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'

// ============================================================================
// TYPES
// ============================================================================

interface User {
  id: string | number
  email?: string
  username?: string
  roles?: string[]
  [key: string]: unknown
}

interface UserContextType {
  user: User | null
  isLoading: boolean
  refreshUser: () => Promise<void>
  clearUser: () => void
}

// ============================================================================
// CONTEXT
// ============================================================================

const UserContext = createContext<UserContextType>({
  user: null,
  isLoading: true,
  refreshUser: async () => {},
  clearUser: () => {},
})

// ============================================================================
// PROVIDER
// ============================================================================

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchUser = useCallback(async () => {
    try {
      // Payload CMS provides /api/users/me automatically for authenticated users
      const response = await fetch('/api/users/me', {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        const data = await response.json()
        setUser(data?.user || null)
      } else {
        setUser(null)
      }
    } catch (error) {
      console.error('[UserContext] Error fetching user:', error)
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const refreshUser = useCallback(async () => {
    setIsLoading(true)
    await fetchUser()
  }, [fetchUser])

  const clearUser = useCallback(() => {
    setUser(null)
  }, [])

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  return (
    <UserContext.Provider value={{ user, isLoading, refreshUser, clearUser }}>
      {children}
    </UserContext.Provider>
  )
}

// ============================================================================
// HOOK
// ============================================================================

export const useUser = () => useContext(UserContext)
