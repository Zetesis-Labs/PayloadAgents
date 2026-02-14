'use client'

import dynamic from 'next/dynamic'
import { memo } from 'react'

const PDFDocument = dynamic(
  () => import('./pdf-document') as Promise<{ default: React.ComponentType<{ url: string }> }>,
  { ssr: false }
)

interface PDFPreviewProps {
  pdfUrl: string | null
  error: string | null
  autoSync: boolean
}

export const PDFPreview = memo(function PDFPreview({ pdfUrl, error, autoSync }: PDFPreviewProps) {
  return (
    <div className="katex-field-preview" style={{ flex: 1 }}>
      {!pdfUrl && !error && (
        <span className="katex-field-preview--empty">
          {autoSync ? 'Escribe LaTeX para compilar automáticamente' : 'Pulsa "Compilar" para ver la previsualización'}
        </span>
      )}
      {error && (
        <div className="katex-field-error">
          <strong>Error de compilación:</strong>
          <pre>{error}</pre>
        </div>
      )}
      {pdfUrl && <PDFDocument url={pdfUrl} />}
    </div>
  )
})
