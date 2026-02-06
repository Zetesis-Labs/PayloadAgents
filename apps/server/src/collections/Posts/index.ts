import { buildTaxonomyRelationship } from '@nexo-labs/payload-taxonomies'
import { type CollectionConfig, slugField } from 'payload'
import { superAdminOrTenantAdminAccess } from '@/collections/access/superAdminOrTenantAdmin'
import { syncToTypesense } from './endpoints/syncToTypesense'

export const Posts: CollectionConfig = {
  slug: 'posts',
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
  endpoints: [syncToTypesense],
  fields: [
    {
      name: 'title',
      type: 'text'
    },
    slugField({ useAsSlug: 'title' }),
    {
      name: 'external_id',
      type: 'text',
      index: true,
      admin: {
        description: 'ID externo del contenido importado (ej: ID de tweet)'
      }
    },
    {
      name: 'url',
      type: 'text',
      admin: {
        description: 'URL original del contenido'
      }
    },
    {
      name: 'publishedAt',
      type: 'date',
      index: true,
      required: true,
      admin: {
        description: 'Fecha de publicación del contenido',
        date: {
          pickerAppearance: 'dayAndTime'
        }
      }
    },
    {
      name: 'content',
      type: 'richText',
      admin: {
        description: 'Contenido de la pagina. Se indexa para busqueda y RAG.'
      }
    },
    buildTaxonomyRelationship({
      name: 'categories',
      label: 'Categorias',
      required: false
    }),
    {
      label: 'Videos relacionados',
      name: 'related_links_videos',
      type: 'array',
      fields: [
        { name: 'url', type: 'text', required: true },
        { name: 'title', type: 'text' }
      ]
    },
    {
      label: 'Libros relacionados',
      name: 'related_links_books',
      type: 'array',
      fields: [
        {
          name: 'book',
          type: 'relationship',
          relationTo: 'books',
          required: false,
          admin: {
            description: 'Libro relacionado de la colección'
          }
        },
        { name: 'url', type: 'text', required: false },
        { name: 'title', type: 'text' }
      ]
    },
    {
      label: 'Otros enlaces relacionados',
      name: 'related_links_other',
      type: 'array',
      fields: [
        { name: 'url', type: 'text', required: true },
        { name: 'title', type: 'text' }
      ]
    }
  ]
}
