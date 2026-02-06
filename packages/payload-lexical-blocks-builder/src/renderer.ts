import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'
import type { ArgTypes } from '@storybook/react'

export interface LexicalBlockProps<T> {
  node: {
    fields: T
  }
}
export type BlockRendererFunction = ({ node }: LexicalBlockProps<any>) => Promise<any> | any
export type BlocksRendererFunctions<T extends string> = Record<T, BlockRendererFunction>

export interface GenericStory<P> {
  argTypes?: Partial<ArgTypes<{ node: { fields: P } }>>
}

export type StoryArgs<T> = T extends GenericStory<infer P> ? P : never

export const generateStoryForLexicalBlock = <T extends GenericStory<any>>(
  args: StoryArgs<T>
): { args: LexicalBlockProps<StoryArgs<T>> } => ({
  args: {
    node: { fields: args }
  }
})
export type ExtendedSerializedEditorState = SerializedEditorState & {
  [k: string]: unknown
}
