import type { Field } from 'payload'
import { COLLECTION_SLUG_CUSTOMERS } from '../../model'

/**
 * Fields that the Stripe Inventory plugin injects into the Users collection.
 *
 * - `inventory`: JSON field with JSON Schema typing so `payload generate:types`
 *   produces a proper TypeScript interface (unlocks + favorites) instead of `unknown`.
 * - `customer`: Relationship to the customers collection managed by the plugin.
 */
export const stripeInventoryUserFields: Field[] = [
  {
    name: 'inventory',
    type: 'json',
    admin: { readOnly: false },
    typescriptSchema: [
      () => ({
        type: 'object' as const,
        properties: {
          unlocks: {
            type: 'array' as const,
            items: {
              type: 'object' as const,
              properties: {
                collection: { type: 'string' as const },
                id: { type: 'number' as const },
                dateUnlocked: { type: 'string' as const, format: 'date-time' },
                payload: { type: 'object' as const, additionalProperties: true }
              },
              required: ['collection', 'id', 'dateUnlocked'] as const
            }
          },
          favorites: {
            type: 'array' as const,
            items: {
              type: 'object' as const,
              properties: {
                collection: { type: 'string' as const },
                id: { type: 'number' as const },
                dateUnlocked: { type: 'string' as const, format: 'date-time' },
                payload: { type: 'object' as const, additionalProperties: true }
              },
              required: ['collection', 'id', 'dateUnlocked'] as const
            }
          }
        },
        required: ['unlocks', 'favorites'] as const
      })
    ]
  },
  {
    name: 'customer',
    type: 'relationship',
    hasMany: false,
    relationTo: COLLECTION_SLUG_CUSTOMERS
  }
]
