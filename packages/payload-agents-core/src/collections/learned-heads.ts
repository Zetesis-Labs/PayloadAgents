/**
 * Learned Heads collection ("lentes").
 *
 * A `LearnedHead` is a tenant-owned, reusable soft re-ranker: a logistic
 * regression probe trained over frozen embeddings (BGE-M3). It is trained from
 * a set of labeled example chunks (positive = surface, negative = bury) and,
 * once `ready`, can be attached to any number of `SearchProfiles` (N:1) to
 * re-order retrieval candidates by `dot(weights.w, chunk.embedding) + weights.b`.
 *
 * The package ships the data model + a UI slot; the consumer wires the builder
 * component (corpus search + labeling) and the training endpoint, plus
 * multi-tenant scoping, the same way it does for the agents collection.
 */

import type { CollectionConfig, Field } from 'payload'

export interface CreateLearnedHeadsCollectionConfig {
  /** Override the Payload collection slug. Default: `'learned-heads'`. */
  collectionSlug?: string

  /**
   * Import-map path to a custom client component rendered at the top of the
   * edit view (e.g. `@/components/admin/lente-builder#LenteBuilder`). It curates
   * `examples` and triggers training. When omitted, only the raw fields show.
   */
  builderComponentPath?: string

  /**
   * Transform the generated config before registration. Spread and override
   * only what you need (access, hooks, indexes, tenant field, endpoints).
   */
  collectionOverrides?: (config: CollectionConfig) => CollectionConfig
}

export function createLearnedHeadsCollection(config: CreateLearnedHeadsCollectionConfig): CollectionConfig {
  const collectionSlug = config.collectionSlug ?? 'learned-heads'

  const builderField: Field[] = config.builderComponentPath
    ? [
        {
          name: 'builder',
          type: 'ui',
          admin: { components: { Field: { path: config.builderComponentPath } } }
        }
      ]
    : []

  const fields: Field[] = [
    {
      name: 'name',
      type: 'text',
      required: true,
      admin: { description: 'Display name, e.g. "Praxeología" or "Registro divulgativo".' }
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      admin: { description: 'URL-friendly identifier. Must be unique within the tenant.' }
    },
    {
      name: 'description',
      type: 'textarea',
      admin: { description: 'What this lente favors vs buries.' }
    },
    ...builderField,
    {
      name: 'status',
      type: 'select',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Training', value: 'training' },
        { label: 'Ready', value: 'ready' },
        { label: 'Failed', value: 'failed' }
      ],
      defaultValue: 'draft',
      admin: { readOnly: true, description: 'Set automatically by the training endpoint.' }
    },
    {
      name: 'kind',
      type: 'select',
      options: [{ label: 'Logistic Regression (frozen encoder)', value: 'logreg' }],
      defaultValue: 'logreg'
    },
    {
      name: 'baseEncoder',
      type: 'text',
      defaultValue: 'bge-m3',
      admin: { description: 'Must match the encoder the corpus chunks were embedded with.' }
    },
    {
      name: 'version',
      type: 'number',
      defaultValue: 0,
      admin: { readOnly: true, description: 'Incremented on each successful train.' }
    },
    {
      name: 'weights',
      type: 'json',
      admin: { hidden: true }
    },
    {
      name: 'metrics',
      type: 'json',
      admin: { readOnly: true, description: '{ f1_macro, val_size, trained_at } — populated after training.' }
    },
    {
      name: 'examples',
      type: 'array',
      admin: {
        description:
          'Labeled chunks. positive = surface, negative = bury. Minimum 8 of each. chunkId + collection identify the Typesense document whose embedding is the feature vector.'
      },
      fields: [
        { name: 'chunkId', type: 'text', required: true, admin: { description: 'Typesense document ID.' } },
        {
          name: 'collection',
          type: 'text',
          required: true,
          admin: { description: 'Typesense collection name (e.g. books_chunk).' }
        },
        {
          name: 'chunkText',
          type: 'textarea',
          required: true,
          admin: { description: 'Snapshot of the chunk text — for human review, not re-fetched.' }
        },
        {
          name: 'label',
          type: 'select',
          required: true,
          options: [
            { label: 'Positive', value: 'positive' },
            { label: 'Negative', value: 'negative' }
          ],
          admin: { description: 'positive = the lente surfaces this; negative = it buries it.' }
        },
        { name: 'queryContext', type: 'text', admin: { description: 'Optional query that surfaced this chunk.' } },
        {
          name: 'source',
          type: 'select',
          options: [
            { label: 'Manual', value: 'manual' },
            { label: 'LLM Bootstrap', value: 'llm_bootstrap' },
            { label: 'Chat Feedback', value: 'feedback_chat' }
          ],
          defaultValue: 'manual'
        }
      ]
    }
  ]

  const base: CollectionConfig = {
    slug: collectionSlug,
    access: {
      read: () => true,
      create: ({ req: { user } }) => Boolean(user),
      update: ({ req: { user } }) => Boolean(user),
      delete: ({ req: { user } }) => Boolean(user)
    },
    admin: {
      useAsTitle: 'name',
      group: 'Chat',
      defaultColumns: ['name', 'status', 'version', 'tenant', 'updatedAt']
    },
    fields
  }

  return config.collectionOverrides ? config.collectionOverrides(base) : base
}
