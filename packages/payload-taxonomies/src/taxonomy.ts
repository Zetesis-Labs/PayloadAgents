import type { JSONSchema4 } from 'json-schema'
import { type CollectionConfig, slugField } from 'payload'
import { COLLECTION_SLUG_TAXONOMY } from './constants'

type TaxonomyTypescriptSchema = {
  payloadTypescriptSchema?: Array<(args: { jsonSchema: JSONSchema4 }) => JSONSchema4>
}

export const taxonomiesCollection: (config: Partial<CollectionConfig> & TaxonomyTypescriptSchema) => CollectionConfig =
  ({ payloadTypescriptSchema, ...config }) => ({
    ...config,
    slug: COLLECTION_SLUG_TAXONOMY,
    labels: {
      singular: 'Taxonomia',
      plural: 'Taxonomias',
      ...config.labels
    },
    admin: {
      useAsTitle: 'name',
      group: 'Contenido',
      defaultColumns: ['name', 'parent', 'payload'],
      ...config.admin
    },
    fields: [
      {
        name: 'name',
        label: 'Nombre',
        type: 'text',
        localized: true,
        required: true
      },
      slugField({ useAsSlug: 'name' }),
      {
        name: 'payload',
        label: 'Payload Adicional',
        type: 'json',
        required: false,
        typescriptSchema: payloadTypescriptSchema,
        admin: {
          description: 'Metadata: types, permissions, selectable, etc.'
        }
      },
      ...(config.fields ?? [])
    ]
  })
