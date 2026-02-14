'use client'

import { useField } from '@payloadcms/ui'
import type { TextareaFieldClientComponent } from 'payload'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { vscodeDark } from '@uiw/codemirror-theme-vscode'
import { StreamLanguage } from '@codemirror/language'
import { stex } from '@codemirror/legacy-modes/mode/stex'
import { GripVertical } from 'lucide-react'
import { compileLatex } from './compile-latex-actions'
import { askLatexAI } from './latex-ai-actions'
import './katex-field.css'

const latexLang = StreamLanguage.define(stex)

const KatexField: TextareaFieldClientComponent = ({ field, path }) => {
  const { value, setValue } = useField<string>({ path })
  const extensions = useMemo(() => [latexLang], [])
  const [showPreview, setShowPreview] = useState(true)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [compileLog, setCompileLog] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [compiling, setCompiling] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiMessage, setAiMessage] = useState<{ text: string; isError: boolean } | null>(null)
  const [editorWidth, setEditorWidth] = useState(50)
  const bodyRef = useRef<HTMLDivElement>(null)
  const pdfUrlRef = useRef<string | null>(null)

  // Revoke previous blob URL when creating a new one or on unmount
  const revokePdfUrl = useCallback(() => {
    if (pdfUrlRef.current) {
      URL.revokeObjectURL(pdfUrlRef.current)
      pdfUrlRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => revokePdfUrl()
  }, [revokePdfUrl])

  const handleCompile = async () => {
    if (!value || compiling) return

    setCompiling(true)
    setError(null)
    setCompileLog(null)

    try {
      const result = await compileLatex(value)
      setCompileLog(result.log || null)

      if (result.success && result.pdf) {
        const bytes = Uint8Array.from(atob(result.pdf), (c) => c.charCodeAt(0))
        const blob = new Blob([bytes], { type: 'application/pdf' })
        revokePdfUrl()
        const url = URL.createObjectURL(blob)
        pdfUrlRef.current = url
        setPdfUrl(url)
      } else {
        revokePdfUrl()
        setPdfUrl(null)
        setError(result.error ?? 'Error de compilación.')
      }
    } catch {
      setError('Error de conexión con el servidor.')
    } finally {
      setCompiling(false)
    }
  }

  const handleAISubmit = async () => {
    if (!aiPrompt.trim() || aiLoading) return

    setAiLoading(true)
    setAiMessage(null)

    try {
      const compilationErrors = [error, compileLog].filter(Boolean).join('\n')
      const result = await askLatexAI({
        instruction: aiPrompt.trim(),
        currentLatex: value ?? '',
        compilationErrors: compilationErrors || null,
      })

      if (result.success && result.latex) {
        setValue(result.latex)
        setAiMessage({ text: result.message, isError: false })
        setAiPrompt('')
      } else {
        setAiMessage({ text: result.message, isError: true })
      }
    } catch {
      setAiMessage({ text: 'Error de conexión con el servidor.', isError: true })
    } finally {
      setAiLoading(false)
    }
  }

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const body = bodyRef.current
      if (!body) return

      body.classList.add('katex-field-body--resizing')

      const onMouseMove = (ev: MouseEvent) => {
        const rect = body.getBoundingClientRect()
        const pct = ((ev.clientX - rect.left) / rect.width) * 100
        setEditorWidth(Math.min(80, Math.max(20, pct)))
      }

      const onMouseUp = () => {
        body.classList.remove('katex-field-body--resizing')
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
      }

      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    },
    [],
  )

  return (
    <div className="katex-field-container">
      <div className="katex-field-header">
        <label className="katex-field-label">
          {typeof field.label === 'string' ? field.label : field.name}
        </label>
        <div className="katex-field-actions">
          <button
            type="button"
            className="katex-field-compile"
            onClick={handleCompile}
            disabled={compiling || !value}
          >
            {compiling ? 'Compilando...' : 'Compilar PDF'}
          </button>
          <button
            type="button"
            className="katex-field-toggle"
            onClick={() => setShowPreview((prev) => !prev)}
          >
            {showPreview ? 'Ocultar preview' : 'Mostrar preview'}
          </button>
        </div>
      </div>

      {/* AI assistant bar */}
      <div className="katex-field-ai">
        <input
          type="text"
          className="katex-field-ai-input"
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleAISubmit()
            }
          }}
          placeholder="Instrucción para la IA: ej. 'corrige los errores', 'añade una sección sobre X'..."
          disabled={aiLoading}
        />
        <button
          type="button"
          className="katex-field-ai-button"
          onClick={handleAISubmit}
          disabled={aiLoading || !aiPrompt.trim()}
        >
          {aiLoading ? 'Pensando...' : 'Enviar a IA'}
        </button>
      </div>
      {aiMessage && (
        <div
          className={`katex-field-ai-message ${aiMessage.isError ? 'katex-field-ai-message--error' : 'katex-field-ai-message--success'}`}
        >
          {aiMessage.text}
        </div>
      )}

      <div
        ref={bodyRef}
        className={`katex-field-body${!showPreview ? ' katex-field-body--stacked' : ''}`}
      >
        <div
          className="katex-field-editor"
          style={showPreview ? { flex: `0 0 ${editorWidth}%` } : undefined}
        >
          <CodeMirror
            value={value ?? ''}
            onChange={(val) => setValue(val)}
            theme={vscodeDark}
            extensions={extensions}
            height="100%"
            placeholder={'\\documentclass{article}\n\\begin{document}\nHola mundo\n\\end{document}'}
            basicSetup={{
              lineNumbers: true,
              bracketMatching: true,
              foldGutter: true,
              highlightActiveLine: true,
              autocompletion: false,
            }}
          />
        </div>

        {showPreview && (
          <div className="katex-field-divider" onMouseDown={handleDragStart}>
            <GripVertical size={14} />
          </div>
        )}

        {showPreview && (
          <div className="katex-field-preview" style={{ flex: 1 }}>
            {!pdfUrl && !error && (
              <span className="katex-field-preview--empty">
                Pulsa &quot;Compilar PDF&quot; para ver la previsualización
              </span>
            )}
            {error && (
              <div className="katex-field-error">
                <strong>Error de compilación:</strong>
                <pre>{error}</pre>
              </div>
            )}
            {pdfUrl && (
              <iframe
                src={pdfUrl}
                className="katex-field-iframe"
                title="Vista previa PDF"
              />
            )}
          </div>
        )}
      </div>

      {compileLog && (
        <details className="katex-field-log">
          <summary>Log de compilación</summary>
          <pre>{compileLog}</pre>
        </details>
      )}
    </div>
  )
}

export default KatexField
