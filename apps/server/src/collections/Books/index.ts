import { buildTaxonomyRelationship } from '@nexo-labs/payload-taxonomies'
import { type CollectionConfig, slugField } from 'payload'
import { superAdminOrTenantAdminAccess } from '@/collections/access/superAdminOrTenantAdmin'

export const Books: CollectionConfig = {
  slug: 'books',
  access: {
    create: superAdminOrTenantAdminAccess,
    delete: superAdminOrTenantAdminAccess,
    read: () => true,
    update: superAdminOrTenantAdminAccess
  },
  admin: {
    useAsTitle: 'title',
    components: {
      views: {
        list: {
          actions: ['@/modules/payload-admin/sync-typesense-button']
        }
      }
    }
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      admin: {
        description: 'Título del libro'
      }
    },
    slugField({ useAsSlug: 'title' }),
    {
      name: 'publishedAt',
      type: 'date',
      index: true,
      required: true,
      admin: {
        description: 'Fecha de publicación del libro',
        date: {
          pickerAppearance: 'dayAndTime'
        }
      }
    },
    buildTaxonomyRelationship({
      name: 'categories',
      label: 'Categorias',
      required: false
    }),
    {
      name: 'chapters',
      type: 'array',
      required: false,
      admin: {
        description: 'Capítulos del libro'
      },
      fields: [
        {
          name: 'title',
          type: 'text',
          required: false,
          admin: {
            description: 'Título del capítulo (opcional)'
          }
        },
        {
          name: 'content',
          type: 'code',
          required: true,
          admin: {
            language: 'markdown',
            description: 'Contenido del capítulo en formato markdown'
          }
        }
      ]
    }
  ]
}
