import type { SerializedEditorState, SerializedLexicalNode } from '@payloadcms/richtext-lexical/lexical'
import type { SerializedBlockNode } from '@payloadcms/richtext-lexical'
import type { JSXConverter } from '@payloadcms/richtext-lexical/react'
import type { ArgTypes } from '@storybook/react'

/** Props passed to block renderers - node.fields contains the block data */
export interface LexicalBlockProps<T> {
  node: {
    fields: T
  }
}

/**
 * Block converter compatible with RichText's JSXConverters.blocks.
 * Uses JSXConverter directly to ensure full compatibility with PayloadCMS types.
 */
export type BlockRendererFunction = JSXConverter<SerializedBlockNode<Record<string, unknown>>>

export type BlocksRendererFunctions<T extends string> = Record<T, BlockRendererFunction>

export interface GenericStory<P> {
  argTypes?: Partial<ArgTypes<{ node: { fields: P } }>>
}

export type StoryArgs<T> = T extends GenericStory<infer P> ? P : never

export const generateStoryForLexicalBlock = <T extends GenericStory<unknown>>(
  args: StoryArgs<T>
): { args: LexicalBlockProps<StoryArgs<T>> } => ({
  args: {
    node: { fields: args }
  }
})
export type ExtendedSerializedEditorState = SerializedEditorState & {
  [k: string]: unknown
}
