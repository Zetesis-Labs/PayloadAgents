'use client'

import { Button } from '@payloadcms/ui'
import type React from 'react'
import { useState } from 'react'

interface SyncResult {
  success: boolean
  message: string
  totalOrganizations?: number
  results?: {
    created: string[]
    updated: string[]
    skipped: string[]
    errors: string[]
  }
}

export const SyncTenantsButton: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)

  const handleSync = async () => {
    setIsLoading(true)
    setResult(null)

    try {
      const response = await fetch('/api/tenants/sync-from-keycloak', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const data: SyncResult = await response.json()
      setResult(data)

      if (data.success) {
        // Recargar la página para mostrar los nuevos tenants
        setTimeout(() => {
          window.location.reload()
        }, 2000)
      }
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : 'Error desconocido'
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <Button onClick={handleSync} disabled={isLoading}>
        {isLoading ? (
          <>
            <svg
              aria-hidden="true"
              style={{
                animation: 'spin 1s linear infinite',
                width: '16px',
                height: '16px'
              }}
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Sincronizando...
          </>
        ) : (
          <>
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 21h5v-5" />
            </svg>
            Sincronizar desde Keycloak
          </>
        )}
      </Button>

      {result && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '13px',
            backgroundColor: result.success ? '#dcfce7' : '#fee2e2',
            color: result.success ? '#166534' : '#991b1b'
          }}
        >
          {result.success ? (
            <>
              ✓ {result.results?.created.length || 0} creados, {result.results?.updated.length || 0} actualizados,{' '}
              {result.results?.skipped.length || 0} sin cambios
            </>
          ) : (
            <>✕ {result.message}</>
          )}
        </div>
      )}

      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  )
}

export default SyncTenantsButton
