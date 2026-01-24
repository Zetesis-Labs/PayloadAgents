"use client"

import ReactMarkdown from "react-markdown"
import type { FC } from "react"

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
