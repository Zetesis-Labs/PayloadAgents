'use client'

import { Button, Pill, toast, useDocumentInfo, useField } from '@payloadcms/ui'
import type { SelectFieldClientComponent } from 'payload'
import { useCallback, useState } from 'react'

type SyncStatus = 'synced' | 'outdated' | 'not-indexed' | 'error'

const pillStyle: Record<SyncStatus, 'success' | 'error' | 'warning' | undefined> = {
  synced: 'success',
  outdated: 'warning',
  'not-indexed': 'error',
  error: 'error'
}

const labels: Record<SyncStatus, string> = {
  synced: 'Synced',
  outdated: 'Outdated',
  'not-indexed': 'Not indexed',
  error: 'Error'
}

const descriptions: Record<SyncStatus, string> = {
  synced: 'This document is in sync with the search index.',
  outdated: 'Content has changed since the last index sync. Save or re-index to update.',
  'not-indexed': 'This document has not been indexed yet.',
  error: 'Could not determine sync status.'
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '16px 0'
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px'
}

const descStyle: React.CSSProperties = {
  fontSize: '13px',
  opacity: 0.7
}

/**
 * Custom client props injected by the plugin, namespaced per adapter
 * (e.g. basePath `/api/sync-status-pgvector`, instanceLabel `Pgvector Sync`).
 */
type SyncStatusFieldProps = Parameters<SelectFieldClientComponent>[0] & {
  basePath?: string
  instanceLabel?: string
}

export const SyncStatusField = (props: SyncStatusFieldProps) => {
  const { path, basePath, instanceLabel = 'Sync' } = props
  const { value, setValue } = useField<string>({ path })
  const { id, collectionSlug } = useDocumentInfo()
  const [syncing, setSyncing] = useState(false)
  const status = (value as SyncStatus) || 'not-indexed'

  const handleSync = useCallback(async () => {
    if (!id || !collectionSlug || syncing) return

    setSyncing(true)
    try {
      const res = await fetch(`${basePath}/${collectionSlug}/${id}/sync`, { method: 'POST' })
      const data = (await res.json()) as { success?: boolean; status?: string; error?: string }

      if (data.success) {
        setValue(data.status ?? 'synced')
        toast.success('Document synced to index')
      } else {
        setValue('error')
        toast.error(data.error ?? 'Sync failed')
      }
    } catch {
      setValue('error')
      toast.error('Sync request failed')
    } finally {
      setSyncing(false)
    }
  }, [id, collectionSlug, syncing, setValue, basePath])

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <strong>{instanceLabel}</strong>
        <Pill pillStyle={pillStyle[status]} size="small">
          {labels[status]}
        </Pill>
      </div>
      {descriptions[status] && <span style={descStyle}>{descriptions[status]}</span>}
      {id && (
        <Button buttonStyle="secondary" size="small" onClick={handleSync} disabled={syncing}>
          {syncing ? 'Syncing...' : 'Sync Now'}
        </Button>
      )}
    </div>
  )
}
