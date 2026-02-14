'use client'

import { useCallback, useState } from 'react'
import { askLatexAI } from '../../latex-ai-actions'

interface AIMessage {
  text: string
  isError: boolean
}

export function useAI(getValue: () => string, setValue: (v: string) => void, getCompilationContext: () => string) {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<AIMessage | null>(null)

  const submit = useCallback(async () => {
    const trimmed = prompt.trim()
    if (!trimmed || loading) return

    setLoading(true)
    setMessage(null)

    try {
      const result = await askLatexAI({
        instruction: trimmed,
        currentLatex: getValue(),
        compilationErrors: getCompilationContext() || null
      })

      if (result.success && result.latex) {
        setValue(result.latex)
        setMessage({ text: result.message, isError: false })
        setPrompt('')
      } else {
        setMessage({ text: result.message, isError: true })
      }
    } catch {
      setMessage({ text: 'Error de conexión con el servidor.', isError: true })
    } finally {
      setLoading(false)
    }
  }, [prompt, loading, getValue, setValue, getCompilationContext])

  return { prompt, setPrompt, loading, message, submit }
}
