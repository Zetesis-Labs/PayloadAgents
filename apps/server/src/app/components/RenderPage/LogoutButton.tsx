'use client'

import { useState } from 'react'

export const LogoutButton: React.FC = () => {
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const handleLogout = async () => {
    setIsLoggingOut(true)

    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      })

      const result = await response.json()

      if (result.success && result.logoutUrl) {
        window.location.href = result.logoutUrl
      } else {
        window.location.href = '/'
      }
    } catch (error) {
      console.error('[LogoutButton] Error:', error)
      window.location.href = '/'
    }
  }

  return (
    <button type="button" onClick={handleLogout} disabled={isLoggingOut}>
      {isLoggingOut ? 'Cerrando sesión...' : 'Logout'}
    </button>
  )
}
