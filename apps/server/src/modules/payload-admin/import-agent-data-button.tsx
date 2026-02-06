'use client'

import React, { useState, useRef } from 'react'
import { Button, useDocumentInfo, useField } from '@payloadcms/ui'
import { useTenantSelection } from '@payloadcms/plugin-multi-tenant/client'
import type { UIFieldClientComponent } from 'payload'
import { importAgentData } from './import-agent-data-actions'
import type { ImportMode, CollectionTarget, ImportResult } from './admin-types'
import { SpinnerIcon, ImportIcon, SyncIcon } from './admin-icons'
import { readFileAsText, loadingLabels } from './admin-utils'
import { ImportResultDisplay } from './import-result-display'

export const ImportAgentDataButton: UIFieldClientComponent = () => {
  const [activeAction, setActiveAction] = useState<ImportMode | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedCollection, setSelectedCollection] = useState<CollectionTarget>('posts')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { id } = useDocumentInfo()
  const { value: slug } = useField<string>({ path: 'slug' })
  const { selectedTenantID } = useTenantSelection()

  const handleAction = async (mode: ImportMode) => {
    if (!id) {
      setResult({
        success: false,
        message: 'No se puede ejecutar: el agente no ha sido guardado aún',
      })
      return
    }

    setActiveAction(mode)
    setResult(null)

    try {
      let jsonContent: string | undefined
      if (selectedFile && (mode === 'import' || mode === 'import-sync')) {
        jsonContent = await readFileAsText(selectedFile)
      }

      const overrideAttributes = selectedTenantID ? { tenantId: Number(selectedTenantID) } : undefined
      const data = await importAgentData({ agentId: id, mode, jsonContent, collection: selectedCollection, overrideAttributes })
      setResult(data)

      if (data.success) {
        setTimeout(() => setResult(null), 8000)
      }
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : 'Error desconocido',
      })
    } finally {
      setActiveAction(null)
    }
  }

  const isLoading = activeAction !== null
  const expectedFile = slug ? `${slug}_data.json` : '{slug}_data.json'

  return (
    <div
      style={{
        padding: '16px',
        marginBottom: '20px',
        backgroundColor: 'var(--theme-elevation-50)',
        borderRadius: '8px',
        border: '1px solid var(--theme-elevation-100)',
      }}
    >
      <div style={{ marginBottom: '12px' }}>
        <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 600, color: 'var(--theme-text)' }}>
          Importar datos del agente
        </h4>
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--theme-elevation-500)' }}>
          Sube un archivo JSON o usa <code style={{ backgroundColor: 'var(--theme-elevation-100)', padding: '2px 6px', borderRadius: '4px' }}>
            data/{expectedFile}
          </code> como fallback.
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--theme-text)' }}>
          Colección:
        </label>
        <select
          value={selectedCollection}
          onChange={(e) => {
            setSelectedCollection(e.target.value as CollectionTarget)
            setResult(null)
          }}
          disabled={isLoading}
          style={{
            padding: '4px 8px',
            fontSize: '13px',
            borderRadius: '4px',
            border: '1px solid var(--theme-elevation-150)',
            backgroundColor: 'var(--theme-input-bg)',
            color: 'var(--theme-text)',
            cursor: isLoading ? 'not-allowed' : 'pointer',
          }}
        >
          <option value="posts">Posts</option>
          <option value="books">Books</option>
        </select>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null
            setSelectedFile(file)
            setResult(null)
          }}
        />
        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          buttonStyle="secondary"
          size="small"
        >
          Seleccionar JSON
        </Button>
        {selectedFile && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--theme-text)' }}>
            <code style={{ backgroundColor: 'var(--theme-elevation-100)', padding: '2px 6px', borderRadius: '4px' }}>
              {selectedFile.name}
            </code>
            <button
              type="button"
              onClick={() => {
                setSelectedFile(null)
                if (fileInputRef.current) fileInputRef.current.value = ''
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0 2px',
                fontSize: '14px',
                color: 'var(--theme-elevation-500)',
                lineHeight: 1,
              }}
              title="Quitar archivo"
            >
              &#10005;
            </button>
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <Button
          onClick={() => handleAction('import')}
          disabled={isLoading || !id}
          buttonStyle="secondary"
        >
          {activeAction === 'import' ? (
            <>
              <SpinnerIcon />
              {loadingLabels['import']}
            </>
          ) : (
            <>
              <ImportIcon />
              Importar datos
            </>
          )}
        </Button>

        <Button
          onClick={() => handleAction('import-sync')}
          disabled={isLoading || !id}
          buttonStyle="secondary"
        >
          {activeAction === 'import-sync' ? (
            <>
              <SpinnerIcon />
              {loadingLabels['import-sync']}
            </>
          ) : (
            <>
              <ImportIcon />
              Importar y sincronizar
            </>
          )}
        </Button>

        <Button
          onClick={() => handleAction('sync')}
          disabled={isLoading || !id}
          buttonStyle="secondary"
        >
          {activeAction === 'sync' ? (
            <>
              <SpinnerIcon />
              {loadingLabels['sync']}
            </>
          ) : (
            <>
              <SyncIcon />
              Sincronizar datos
            </>
          )}
        </Button>

        {!id && (
          <span style={{ fontSize: '12px', color: 'var(--theme-elevation-400)' }}>
            Guarda el agente primero para poder importar
          </span>
        )}
      </div>

      <div style={{ marginTop: '12px' }}>
        <ImportResultDisplay result={result} />
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
