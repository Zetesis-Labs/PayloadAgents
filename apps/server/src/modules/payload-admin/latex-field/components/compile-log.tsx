'use client'

import { memo } from 'react'

interface CompileLogProps {
  log: string | null
}

export const CompileLog = memo(function CompileLog({ log }: CompileLogProps) {
  if (!log) return null

  return (
    <details className="katex-field-log">
      <summary>Log de compilación</summary>
      <pre>{log}</pre>
    </details>
  )
})
