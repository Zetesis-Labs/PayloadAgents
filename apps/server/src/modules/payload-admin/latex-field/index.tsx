'use client'

import { StreamLanguage } from '@codemirror/language'
import { stex } from '@codemirror/legacy-modes/mode/stex'
import { useField } from '@payloadcms/ui'
import { vscodeDark } from '@uiw/codemirror-theme-vscode'
import CodeMirror from '@uiw/react-codemirror'
import { GripVertical, Play } from 'lucide-react'
import type { TextareaFieldClientComponent } from 'payload'
import { useCallback, useMemo, useRef, useState } from 'react'
import { AIBar } from './components/ai-bar'
import { CompileLog } from './components/compile-log'
import { EditorHeader } from './components/editor-header'
import { PDFPreview } from './components/pdf-preview'
import { useAI } from './hooks/use-ai'
import { useCompile } from './hooks/use-compile'
import { useDragResize } from './hooks/use-drag-resize'
import './latex-field.css'

const latexLang = StreamLanguage.define(stex)
const basicSetup = {
  lineNumbers: true,
  bracketMatching: true,
  foldGutter: true,
  highlightActiveLine: true,
  autocompletion: false
} as const

const LatexField: TextareaFieldClientComponent = ({ field, path }) => {
  const { value, setValue } = useField<string>({ path })
  const extensions = useMemo(() => [latexLang], [])
  const [showPreview, setShowPreview] = useState(true)
  const valueRef = useRef(value)
  valueRef.current = value

  const { pdfUrl, compileLog, error, compiling, autoSync, autoSyncRef, compile, scheduleAutoCompile, toggleAutoSync } =
    useCompile()

  const { editorWidth, bodyRef, handleDragStart } = useDragResize()

  const getLatex = useCallback(() => valueRef.current ?? '', [])
  const getCompilationContext = useCallback(() => {
    return [error, compileLog].filter(Boolean).join('\n')
  }, [error, compileLog])

  const ai = useAI(getLatex, setValue, getCompilationContext)

  const handleCompile = useCallback(() => {
    compile(value ?? '')
  }, [compile, value])

  const handleChange = useCallback(
    (val: string) => {
      setValue(val)
      if (autoSyncRef.current) scheduleAutoCompile(val)
    },
    [setValue, autoSyncRef, scheduleAutoCompile]
  )

  const togglePreview = useCallback(() => {
    setShowPreview(prev => !prev)
  }, [])

  const label = typeof field.label === 'string' ? field.label : field.name

  return (
    <div className="katex-field-container">
      <EditorHeader
        label={label}
        autoSync={autoSync}
        showPreview={showPreview}
        onToggleAutoSync={toggleAutoSync}
        onTogglePreview={togglePreview}
      />

      <AIBar
        prompt={ai.prompt}
        loading={ai.loading}
        message={ai.message}
        onPromptChange={ai.setPrompt}
        onSubmit={ai.submit}
      />

      <div ref={bodyRef} className={`katex-field-body${!showPreview ? ' katex-field-body--stacked' : ''}`}>
        <div className="katex-field-editor" style={showPreview ? { flex: `0 0 ${editorWidth}%` } : undefined}>
          <CodeMirror
            value={value ?? ''}
            onChange={handleChange}
            theme={vscodeDark}
            extensions={extensions}
            height="100%"
            placeholder={'\\documentclass{article}\n\\begin{document}\nHola mundo\n\\end{document}'}
            basicSetup={basicSetup}
          />
        </div>

        {showPreview && (
          <button
            type="button"
            className="katex-field-divider"
            onMouseDown={handleDragStart}
            aria-label="Resize divider"
          >
            <GripVertical size={14} />
          </button>
        )}

        {showPreview && <PDFPreview pdfUrl={pdfUrl} error={error} autoSync={autoSync} />}
      </div>

      <CompileLog log={compileLog} />

      {!autoSync && (
        <button
          type="button"
          className="katex-field-fab"
          onClick={handleCompile}
          disabled={compiling || !value}
          title="Compilar PDF"
        >
          <Play size={16} />
          {compiling ? 'Compilando...' : 'Compilar'}
        </button>
      )}
    </div>
  )
}

export default LatexField
