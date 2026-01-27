import type { CollectionConfig } from 'payload'

import { ensureUniqueSlug } from './hooks/ensureUniqueSlug'
import { superAdminOrTenantAdminAccess } from '@/collections/Pages/access/superAdminOrTenantAdmin'
import { syncToTypesense } from './endpoints/syncToTypesense'
import { buildTaxonomyRelationship } from '@nexo-labs/payload-taxonomies'

export const Pages: CollectionConfig = {
  slug: 'pages',
  access: {
    create: superAdminOrTenantAdminAccess,
    delete: superAdminOrTenantAdminAccess,
    read: () => true,
    update: superAdminOrTenantAdminAccess,
  },
  admin: {
    useAsTitle: 'title',
    components: {
      views: {
        list: {
          actions: ['@/modules/payload-admin/sync-typesense-button'],
        },
      },
    },
  },
  endpoints: [syncToTypesense],
  fields: [
    {
      name: 'title',
      type: 'text',
    },
    {
      name: 'slug',
      type: 'text',
      defaultValue: 'home',
      hooks: {
        beforeValidate: [ensureUniqueSlug],
      },
      index: true,
    },
    {
      name: 'external_id',
      type: 'text',
      index: true,
      admin: {
        description: 'ID externo del contenido importado (ej: ID de tweet)',
      },
    },
    {
      name: 'url',
      type: 'text',
      admin: {
        description: 'URL original del contenido',
      },
    },
    {
      name: 'content',
      type: 'richText',
      admin: {
        description: 'Contenido de la pagina. Se indexa para busqueda y RAG.',
      },
    },
    buildTaxonomyRelationship({
      name: 'categories',
      label: 'Categorias',
      required: false,
    }),
    {
      name: 'related_links_videos',
      type: 'array',
      admin: {
        description: 'Videos relacionados',
      },
      fields: [
        { name: 'url', type: 'text', required: true },
        { name: 'title', type: 'text' },
      ],
    },
    {
      name: 'related_links_books',
      type: 'array',
      admin: {
        description: 'Libros relacionados',
      },
      fields: [
        { name: 'url', type: 'text', required: true },
        { name: 'title', type: 'text' },
      ],
    },
    {
      name: 'related_links_other',
      type: 'array',
      admin: {
        description: 'Otros enlaces relacionados',
      },
      fields: [
        { name: 'url', type: 'text', required: true },
        { name: 'title', type: 'text' },
      ],
    },
  ],
}
