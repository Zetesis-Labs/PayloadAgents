'use client'

import { RefreshCw, RefreshCwOff } from 'lucide-react'
import { memo } from 'react'

interface EditorHeaderProps {
  label: string
  autoSync: boolean
  showPreview: boolean
  onToggleAutoSync: () => void
  onTogglePreview: () => void
}

export const EditorHeader = memo(function EditorHeader({
  label,
  autoSync,
  showPreview,
  onToggleAutoSync,
  onTogglePreview
}: EditorHeaderProps) {
  return (
    <div className="katex-field-header">
      <span className="katex-field-label">{label}</span>
      <div className="katex-field-actions">
        <button
          type="button"
          className={`katex-field-btn katex-field-btn--outline${autoSync ? ' katex-field-btn--active' : ''}`}
          onClick={onToggleAutoSync}
        >
          {autoSync ? <RefreshCw size={13} /> : <RefreshCwOff size={13} />}
          {autoSync ? 'Auto-sync ON' : 'Auto-sync'}
        </button>
        <button type="button" className="katex-field-btn katex-field-btn--outline" onClick={onTogglePreview}>
          {showPreview ? 'Ocultar preview' : 'Mostrar preview'}
        </button>
      </div>
    </div>
  )
})
