/**
 * Stripe Inventory Plugin Factory for Payload CMS
 *
 * This plugin automatically registers Stripe endpoints and webhook handlers.
 * It replaces the need for manual Next.js route handlers.
 *
 * @example
 * ```typescript
 * // payload.config.ts
 * import { createStripeInventoryPlugin } from '@nexo-labs/payload-stripe-inventory/server';
 *
 * export default buildConfig({
 *   plugins: [
 *     createStripeInventoryPlugin({
 *       domain: process.env.DOMAIN!,
 *       routes: { subscriptionPageHref: '/account/subscription' },
 *       onSubscriptionUpdate: async (type, userId) => {
 *         console.log(`Subscription ${type} for user ${userId}`);
 *       },
 *       resolveSubscriptionPermissions: async (subscription, product, payload) => {
 *         // Extract permissions from product metadata or custom fields
 *         return product?.metadata?.permissions?.split(',') || [];
 *       },
 *       resolveContentPermissions: async (content, payload) => {
 *         // Extract required permissions from content
 *         return content.requiredPermissions || [];
 *       },
 *     }),
 *   ],
 * });
 * ```
 */

import { stripePlugin } from '@payloadcms/plugin-stripe'
import type { CollectionSlug, Config, Plugin } from 'payload'
import {
  customerDeleted,
  invoiceSucceeded,
  paymentSucceeded,
  priceDeleted,
  productDeleted,
  subscriptionDeleted,
  subscriptionUpsert
} from '../actions'
import { createStripeEndpoints } from '../endpoints'
import type {
  ResolveContentPermissions,
  ResolveSubscriptionPermissions,
  StripeEndpointConfig,
  StripeInventoryPluginConfig,
  UnlockActionConfig
} from './stripe-inventory-types'
import { stripeInventoryUserFields } from './user-fields'

export { createStripeEndpoints }
export type {
  ResolveContentPermissions,
  ResolveSubscriptionPermissions,
  StripeEndpointConfig,
  StripeInventoryPluginConfig,
  UnlockActionConfig
}

/**
 * Creates the Stripe Inventory plugin for Payload CMS
 *
 * This plugin:
 * - Registers REST endpoints for checkout, portal, update, and donation
 * - Sets up Stripe webhook handlers for subscription and payment events
 * - Syncs customer data between Stripe and Payload
 *
 * @param config - Plugin configuration
 * @returns A Payload plugin function
 *
 * Endpoints registered:
 * - GET /api{basePath}/checkout?priceId={id} - Redirect to Stripe Checkout
 * - GET /api{basePath}/portal - Redirect to Stripe Billing Portal
 * - GET /api{basePath}/update?subscriptionId={id}&cancelAtPeriodEnd={bool} - Update subscription
 * - GET /api{basePath}/donation?amount={cents} - Returns JSON with checkout URL
 */
export function createStripeInventoryPlugin<TProduct = unknown, TContent = unknown>(
  config: StripeInventoryPluginConfig<TProduct, TContent>
): Plugin {
  const basePath = config.basePath || '/stripe'

  // Callback for subscription updates (defaults to no-op)
  const onSubscriptionUpdate =
    config.onSubscriptionUpdate ||
    (async () => {
      /* no-op */
    })

  // Required callbacks for permission resolution
  const { resolveSubscriptionPermissions } = config

  return (incomingConfig: Config): Config => {
    // 1. Resolve the user collection slug from Payload config
    const userSlug: CollectionSlug = incomingConfig.admin?.user || 'users'

    // 2. Build endpoint configuration (needs userSlug from above)
    const endpointConfig: StripeEndpointConfig = {
      domain: config.domain,
      routes: config.routes,
      userSlug,
      donationConfig: config.donationConfig,
      checkPermissions: config.checkPermissions,
      resolveUser: config.resolveUser
    }

    // 3. Create and register Stripe endpoints
    const stripeEndpoints = createStripeEndpoints(endpointConfig, basePath)

    const configWithEndpoints: Config = {
      ...incomingConfig,
      endpoints: [...(incomingConfig.endpoints || []), ...stripeEndpoints]
    }

    // 4. Extend users collection with inventory + customer fields
    const configWithUserFields: Config = {
      ...configWithEndpoints,
      collections: (configWithEndpoints.collections || []).map(collection => {
        if (collection.slug === userSlug) {
          return {
            ...collection,
            fields: [...(collection.fields || []), ...stripeInventoryUserFields]
          }
        }
        return collection
      })
    }

    // 5. Apply the base Stripe plugin with webhook handlers
    const stripePluginInstance = stripePlugin({
      isTestKey: process.env.STRIPE_SECRET_KEY?.includes('sk_test'),
      stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
      stripeWebhooksEndpointSecret: process.env.STRIPE_WEBHOOK_SECRET,
      webhooks: {
        'price.deleted': async ({ event, payload }) => await priceDeleted(event.data.object, payload),
        'customer.subscription.created': async ({ event, payload }) =>
          await subscriptionUpsert<TProduct>(
            event.data.object,
            payload,
            onSubscriptionUpdate,
            resolveSubscriptionPermissions,
            userSlug
          ),
        'customer.subscription.paused': async ({ event, payload }) =>
          await subscriptionUpsert<TProduct>(
            event.data.object,
            payload,
            onSubscriptionUpdate,
            resolveSubscriptionPermissions,
            userSlug
          ),
        'customer.subscription.updated': async ({ event, payload }) =>
          await subscriptionUpsert<TProduct>(
            event.data.object,
            payload,
            onSubscriptionUpdate,
            resolveSubscriptionPermissions,
            userSlug
          ),
        'customer.subscription.deleted': async ({ event, payload }) =>
          await subscriptionDeleted(event.data.object, payload, onSubscriptionUpdate, userSlug),
        'customer.deleted': async ({ event, payload }) => await customerDeleted(event.data.object, payload),
        'product.deleted': async ({ event, payload }) => await productDeleted(event.data.object, payload),
        'payment_intent.succeeded': async ({ event, payload }) => {
          await paymentSucceeded(event.data.object, payload)
          await config.onPaymentSucceeded?.(event.data.object, payload)
        },
        'invoice.paid': async ({ event, payload }) => {
          await invoiceSucceeded(event.data.object, payload)
          await config.onInvoicePaid?.(event.data.object, payload)
        }
      }
    })

    // 6. Apply the Stripe plugin to the config with user fields + endpoints
    return stripePluginInstance(configWithUserFields)
  }
}
