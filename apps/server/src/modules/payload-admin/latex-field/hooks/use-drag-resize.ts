'use client'

import { useCallback, useRef, useState } from 'react'

export function useDragResize(initial = 66.67) {
  const [editorWidth, setEditorWidth] = useState(initial)
  const bodyRef = useRef<HTMLDivElement>(null)

  const handleDragStart = useCallback((e: React.MouseEvent) => {
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
  }, [])

  return { editorWidth, bodyRef, handleDragStart }
}
