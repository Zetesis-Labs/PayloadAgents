'use client'

import React, { useState } from 'react'
import { Button } from '@payloadcms/ui'

interface ImportResult {
  success: boolean
  message: string
  totalAgents?: number
  results?: {
    imported: string[]
    skipped: string[]
    errors: string[]
  }
}

export const ImportAgentsButton: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const handleImport = async () => {
    setIsLoading(true)
    setResult(null)

    try {
      const response = await fetch('/api/agents/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data: ImportResult = await response.json()
      setResult(data)

      if (data.success) {
        setTimeout(() => {
          window.location.reload()
        }, 2000)
      }
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : 'Error desconocido',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <Button onClick={handleImport} disabled={isLoading}>
        {isLoading ? (
          <>
            <svg
              style={{
                animation: 'spin 1s linear infinite',
                width: '16px',
                height: '16px',
                marginRight: '6px',
              }}
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                style={{ opacity: 0.25 }}
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                style={{ opacity: 0.75 }}
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Importando agentes...
          </>
        ) : (
          <>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginRight: '6px' }}
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Importar agentes predefinidos
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
            color: result.success ? '#166534' : '#991b1b',
          }}
        >
          {result.success ? (
            <>
              {result.results?.imported.length || 0} importados,{' '}
              {result.results?.skipped.length || 0} existentes,{' '}
              {result.results?.errors.length || 0} errores
            </>
          ) : (
            <>{result.message}</>
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

export default ImportAgentsButton
