import type { CollectionConfig } from 'payload'
import {
  COLLECTION_SLUG_PRICES,
  COLLECTION_SLUG_PRODUCTS,
  formatOptions,
  PricingPlanInterval,
  PricingType
} from '../../model'
import { createAccessQueries } from '../access'

export const createPricesCollection = (adminPermissionSlug: string): CollectionConfig => {
  const { isAdmin, isAdminOrStripeActive } = createAccessQueries(adminPermissionSlug)

  return {
    slug: COLLECTION_SLUG_PRICES,
    admin: {
      useAsTitle: 'unitAmount',
      group: 'Stripe'
    },
    access: {
      read: isAdminOrStripeActive,
      create: () => false,
      update: () => false,
      delete: isAdmin
    },
    fields: [
      {
        name: 'stripeID',
        label: 'Stripe ID',
        type: 'text',
        required: true,
        admin: { position: 'sidebar', readOnly: true }
      },
      {
        name: 'stripeProductId',
        type: 'text',
        required: true,
        admin: { position: 'sidebar', readOnly: true }
      },
      {
        name: 'product',
        type: 'join',
        collection: COLLECTION_SLUG_PRODUCTS,
        on: 'prices',
        hasMany: false
      },
      {
        name: 'active',
        type: 'checkbox',
        required: true,
        admin: { position: 'sidebar' }
      },
      { name: 'description', type: 'textarea' },
      {
        type: 'row',
        fields: [
          { name: 'unitAmount', type: 'number', required: true },
          { name: 'currency', type: 'text', required: true },
          {
            name: 'type',
            type: 'select',
            options: formatOptions(PricingType),
            required: true
          }
        ]
      },
      {
        type: 'row',
        fields: [
          {
            name: 'interval',
            type: 'select',
            options: formatOptions(PricingPlanInterval)
          },
          { name: 'intervalCount', type: 'number' },
          { name: 'trialPeriodDays', type: 'number' }
        ]
      },
      { name: 'metadata', type: 'json', label: 'Metadata' }
    ]
  }
}
