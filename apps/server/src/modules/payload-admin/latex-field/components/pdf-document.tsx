'use client'

import { useCallback, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

interface PDFDocumentProps {
  url: string
}

export default function PDFDocumentViewer({ url }: PDFDocumentProps) {
  const [numPages, setNumPages] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState<number | undefined>(undefined)

  const onDocumentLoadSuccess = useCallback(({ numPages: n }: { numPages: number }) => {
    setNumPages(n)
    if (containerRef.current) {
      setContainerWidth(containerRef.current.clientWidth)
    }
  }, [])

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <Document
        file={url}
        onLoadSuccess={onDocumentLoadSuccess}
        loading={<span className="katex-field-preview--empty">Cargando PDF...</span>}
      >
        {Array.from({ length: numPages }, (_, i) => (
          <Page
            key={`page-${i + 1}`}
            pageNumber={i + 1}
            width={containerWidth}
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        ))}
      </Document>
    </div>
  )
}
