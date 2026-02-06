import { BlocksFeature, type FeatureProviderServer, lexicalEditor } from '@payloadcms/richtext-lexical'
import type { Block, Config } from 'payload'

export type LexicalBuilder = (blocks: () => Block[]) => Config['editor']

export function buildLexicalByFeatures(
  features: () => FeatureProviderServer<unknown, unknown, unknown>[]
): LexicalBuilder {
  return (blocks: () => Block[]) =>
    lexicalEditor({
      features: () => {
        return [...features(), BlocksFeature({ blocks: blocks() })]
      }
    })
}

export function filterBlocksAtLexicalBuilder<T extends string>(
  builder: LexicalBuilder,
  blocks: () => Block[],
  slugs: T[]
): Config['editor'] {
  return builder(() => blocks().filter(block => !slugs.includes(block.slug as T)))
}
