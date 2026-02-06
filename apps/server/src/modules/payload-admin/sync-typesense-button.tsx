'use client'

import { useTenantSelection } from '@payloadcms/plugin-multi-tenant/client'
import { Button } from '@payloadcms/ui'
import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SpinnerIcon } from './admin-icons'
import type { CollectionTarget, ImportMode, ImportResult } from './admin-types'
import { loadingLabels, readFileAsText } from './admin-utils'
import { importCollectionData } from './import-agent-data-actions'
import { ImportResultDisplay } from './import-result-display'

const menuItems: { mode: ImportMode; label: string; description: string }[] = [
  {
    mode: 'import',
    label: 'Importar datos',
    description: 'Subir JSON sin indexar'
  },
  {
    mode: 'import-sync',
    label: 'Importar y sincronizar',
    description: 'Subir JSON e indexar en Typesense'
  },
  {
    mode: 'sync',
    label: 'Sincronizar con Typesense',
    description: 'Indexar documentos existentes'
  }
]

export const SyncTypesenseButton: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [activeAction, setActiveAction] = useState<ImportMode | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const pendingModeRef = useRef<ImportMode>('import')
  const { selectedTenantID } = useTenantSelection()

  const collection = useMemo<CollectionTarget>(() => {
    if (typeof window === 'undefined') return 'posts'
    return window.location.pathname.includes('/collections/books') ? 'books' : 'posts'
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const executeAction = useCallback(
    async (mode: ImportMode, jsonContent?: string) => {
      setActiveAction(mode)
      setResult(null)
      setIsOpen(false)

      try {
        const overrideAttributes = selectedTenantID ? { tenantId: Number(selectedTenantID) } : undefined
        const data = await importCollectionData({
          collection,
          mode,
          jsonContent,
          overrideAttributes
        })
        setResult(data)

        if (data.success) {
          setTimeout(() => setResult(null), 8000)
        }
      } catch (error) {
        setResult({
          success: false,
          message: error instanceof Error ? error.message : 'Error desconocido'
        })
      } finally {
        setActiveAction(null)
      }
    },
    [collection, selectedTenantID]
  )

  const handleMenuClick = (mode: ImportMode) => {
    if (mode === 'sync') {
      executeAction('sync')
    } else {
      pendingModeRef.current = mode
      fileInputRef.current?.click()
      setIsOpen(false)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const jsonContent = await readFileAsText(file)
      await executeAction(pendingModeRef.current, jsonContent)
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const isLoading = activeAction !== null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <div ref={dropdownRef} style={{ position: 'relative' }}>
        <Button onClick={() => !isLoading && setIsOpen(!isOpen)} disabled={isLoading}>
          {isLoading ? (
            <>
              <SpinnerIcon />
              {loadingLabels[activeAction!]}
            </>
          ) : (
            <>Importar &#9662;</>
          )}
        </Button>

        {isOpen && !isLoading && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '4px',
              backgroundColor: 'var(--theme-elevation-0)',
              border: '1px solid var(--theme-elevation-150)',
              borderRadius: '6px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              zIndex: 1000,
              minWidth: '240px',
              overflow: 'hidden'
            }}
          >
            {menuItems.map(({ mode, label, description }, index) => (
              <button
                key={mode}
                type="button"
                onClick={() => handleMenuClick(mode)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '10px 14px',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '13px',
                  color: 'var(--theme-text)',
                  borderBottom: index < menuItems.length - 1 ? '1px solid var(--theme-elevation-100)' : 'none'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.backgroundColor = 'var(--theme-elevation-50)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                <div style={{ fontWeight: 500 }}>{label}</div>
                <div
                  style={{
                    fontSize: '11px',
                    color: 'var(--theme-elevation-500)',
                    marginTop: '2px'
                  }}
                >
                  {description}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleFileChange} />

      <ImportResultDisplay result={result} />

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

export default SyncTypesenseButton
