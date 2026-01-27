'use client'

import React, { useState } from 'react'
import { Button, useDocumentInfo, useField } from '@payloadcms/ui'
import type { UIFieldClientComponent } from 'payload'

interface ImportResult {
  success: boolean
  message: string
  agentSlug?: string
  dataFile?: string
  totalEntries?: number
  results?: {
    imported: string[]
    skipped: string[]
    errors: string[]
  }
}

export const ImportAgentDataButton: UIFieldClientComponent = () => {
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const { id } = useDocumentInfo()
  const { value: slug } = useField<string>({ path: 'slug' })

  const handleImport = async () => {
    if (!id) {
      setResult({
        success: false,
        message: 'No se puede importar: el agente no ha sido guardado aún',
      })
      return
    }

    setIsLoading(true)
    setResult(null)

    try {
      const response = await fetch(`/api/agents/${id}/import-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data: ImportResult = await response.json()
      setResult(data)

      if (data.success && data.results && data.results.imported.length > 0) {
        setTimeout(() => {
          setResult(null)
        }, 5000)
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

  const expectedFile = slug ? `${slug}_data.json` : '{slug}_data.json'

  return (
    <div
      style={{
        padding: '16px',
        marginBottom: '20px',
        backgroundColor: '#f8fafc',
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
      }}
    >
      <div style={{ marginBottom: '12px' }}>
        <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 600 }}>
          Importar datos del agente
        </h4>
        <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
          Busca el archivo <code style={{ backgroundColor: '#e2e8f0', padding: '2px 6px', borderRadius: '4px' }}>
            data/{expectedFile}
          </code> e importa su contenido a Pages.
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <Button onClick={handleImport} disabled={isLoading || !id} buttonStyle="secondary">
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
              Importando datos...
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
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
              Importar datos
            </>
          )}
        </Button>

        {!id && (
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>
            Guarda el agente primero para poder importar
          </span>
        )}

        {result && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              fontSize: '13px',
              backgroundColor: result.success ? '#dcfce7' : '#fee2e2',
              color: result.success ? '#166534' : '#991b1b',
              maxWidth: '100%',
            }}
          >
            {result.success ? (
              <>
                ✓ Archivo: {result.dataFile} | {result.results?.imported.length || 0} importados,{' '}
                {result.results?.skipped.length || 0} existentes,{' '}
                {result.results?.errors.length || 0} errores
              </>
            ) : (
              <>✗ {result.message}</>
            )}
          </div>
        )}
      </div>

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

export default ImportAgentDataButton
