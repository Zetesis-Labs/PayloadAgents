'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { compileLatex } from '../../compile-latex-actions'

export function useCompile() {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [compileLog, setCompileLog] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [compiling, setCompiling] = useState(false)
  const [autoSync, setAutoSync] = useState(false)

  const pdfUrlRef = useRef<string | null>(null)
  const compilingRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoSyncRef = useRef(false)

  useEffect(() => {
    autoSyncRef.current = autoSync
  }, [autoSync])

  const revokePdfUrl = useCallback(() => {
    if (pdfUrlRef.current) {
      URL.revokeObjectURL(pdfUrlRef.current)
      pdfUrlRef.current = null
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      revokePdfUrl()
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [revokePdfUrl])

  const doCompile = useCallback(
    async (latex: string, preserveOnError: boolean) => {
      if (!latex || compilingRef.current) return

      compilingRef.current = true
      setCompiling(true)
      setError(null)
      setCompileLog(null)

      try {
        const result = await compileLatex(latex)
        setCompileLog(result.log || null)

        if (result.success && result.pdf) {
          const bytes = Uint8Array.from(atob(result.pdf), c => c.charCodeAt(0))
          const blob = new Blob([bytes], { type: 'application/pdf' })
          revokePdfUrl()
          const url = URL.createObjectURL(blob)
          pdfUrlRef.current = url
          setPdfUrl(url)
          setError(null)
        } else if (!preserveOnError) {
          revokePdfUrl()
          setPdfUrl(null)
          setError(result.error ?? 'Error de compilación.')
        }
      } catch {
        if (!preserveOnError) {
          setError('Error de conexión con el servidor.')
        }
      } finally {
        compilingRef.current = false
        setCompiling(false)
      }
    },
    [revokePdfUrl]
  )

  const compile = useCallback(
    (latex: string) => {
      if (!latex || compilingRef.current) return
      doCompile(latex, false)
    },
    [doCompile]
  )

  const scheduleAutoCompile = useCallback(
    (latex: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        doCompile(latex, true)
      }, 1000)
    },
    [doCompile]
  )

  const toggleAutoSync = useCallback(() => {
    setAutoSync(prev => !prev)
  }, [])

  return {
    pdfUrl,
    compileLog,
    error,
    compiling,
    autoSync,
    autoSyncRef,
    compile,
    scheduleAutoCompile,
    toggleAutoSync
  }
}
