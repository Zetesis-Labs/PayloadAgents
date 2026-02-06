import type { CollectionConfig } from 'payload'

import { isSuperAdminAccess } from '@/access/isSuperAdmin'
import { updateAndDeleteAccess } from './access/updateAndDelete'
import { syncFromKeycloak } from './endpoints/syncFromKeycloak'

export const Tenants: CollectionConfig = {
  slug: 'tenants',
  access: {
    create: isSuperAdminAccess,
    delete: updateAndDeleteAccess,
    read: ({ req }) => Boolean(req.user),
    update: updateAndDeleteAccess
  },
  admin: {
    useAsTitle: 'name',
    components: {
      views: {
        list: {
          actions: ['@/modules/payload-admin/sync-tenants-button']
        }
      }
    }
  },
  endpoints: [syncFromKeycloak],
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true
    },
    {
      name: 'domain',
      type: 'text',
      admin: {
        description: 'Used for domain-based tenant handling'
      }
    },
    {
      name: 'slug',
      type: 'text',
      admin: {
        description: 'Used for url paths, example: /tenant-slug/page-slug'
      },
      index: true,
      required: true
    },
    {
      name: 'allowPublicRead',
      type: 'checkbox',
      admin: {
        description: 'If checked, logging in is not required to read. Useful for building public pages.',
        position: 'sidebar'
      },
      defaultValue: false,
      index: true
    },
    {
      name: 'keycloakOrgId',
      type: 'text',
      unique: true,
      index: true,
      admin: {
        description: 'ID de la organizacion en Keycloak (sincronizado automaticamente)',
        position: 'sidebar'
      }
    }
  ]
}
