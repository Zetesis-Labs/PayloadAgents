import type { CollectionConfig } from 'payload'
import { COLLECTION_SLUG_CUSTOMERS } from '../../model'
import { createAccessQueries } from '../access'

export const createCustomersCollection = (adminPermissionSlug: string): CollectionConfig => {
  const { isAdmin } = createAccessQueries(adminPermissionSlug)

  return {
    slug: COLLECTION_SLUG_CUSTOMERS,
    admin: {
      useAsTitle: 'email',
      group: 'Stripe',
      defaultColumns: ['email', 'stripeId', 'createdAt']
    },
    access: {
      read: () => true,
      create: () => false,
      update: () => false,
      delete: isAdmin
    },
    fields: [
      {
        name: 'email',
        type: 'email',
        required: true,
        unique: true,
        admin: {
          position: 'sidebar'
        }
      },
      {
        name: 'stripeId',
        type: 'text',
        required: true,
        unique: true,
        admin: {
          position: 'sidebar',
          readOnly: true
        }
      },
      {
        name: 'inventory',
        type: 'json',
        label: 'Inventario',
        admin: {
          description: 'Datos de inventario de Stripe almacenados como JSON',
          readOnly: true
        }
      }
    ]
  }
}
