'use client'

import { memo } from 'react'

interface AIBarProps {
  prompt: string
  loading: boolean
  message: { text: string; isError: boolean } | null
  onPromptChange: (value: string) => void
  onSubmit: () => void
}

export const AIBar = memo(function AIBar({ prompt, loading, message, onPromptChange, onSubmit }: AIBarProps) {
  return (
    <>
      <div className="katex-field-ai">
        <input
          type="text"
          className="katex-field-ai-input"
          value={prompt}
          onChange={e => onPromptChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSubmit()
            }
          }}
          placeholder="Instrucción para la IA: ej. 'corrige los errores', 'añade una sección sobre X'..."
          disabled={loading}
        />
        <button type="button" className="katex-field-ai-button" onClick={onSubmit} disabled={loading || !prompt.trim()}>
          {loading ? 'Pensando...' : 'Enviar a IA'}
        </button>
      </div>
      {message && (
        <div
          className={`katex-field-ai-message ${message.isError ? 'katex-field-ai-message--error' : 'katex-field-ai-message--success'}`}
        >
          {message.text}
        </div>
      )}
    </>
  )
})
