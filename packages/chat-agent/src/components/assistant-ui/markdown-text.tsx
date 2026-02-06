'use client'

import type { FC } from 'react'
import ReactMarkdown from 'react-markdown'

export interface MarkdownTextProps {
  text: string
}

export const MarkdownText: FC<MarkdownTextProps> = ({ text }) => {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert text-current leading-relaxed">
      <ReactMarkdown>{text}</ReactMarkdown>
    </div>
  )
}
