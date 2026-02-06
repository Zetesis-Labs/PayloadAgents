import type { Endpoint } from 'payload'
import type { StripeEndpointConfig } from '../plugin/stripe-inventory-types'
import { createCheckoutHandler } from './handlers/checkout-handler'
import { createDonationHandler } from './handlers/donation-handler'
import { createPortalHandler } from './handlers/portal-handler'
import { createUpdateHandler } from './handlers/update-handler'

export * from './handlers/checkout-handler'
export * from './handlers/donation-handler'
export * from './handlers/portal-handler'
export * from './handlers/update-handler'
export * from './validators'

/**
 * Creates all Stripe inventory endpoints
 *
 * @param config - Endpoint configuration
 * @param basePath - Base path for endpoints (default: '/stripe')
 * @returns Array of Payload endpoints
 *
 * @example
 * ```typescript
 * const endpoints = createStripeEndpoints({
 *   routes: { subscriptionPageHref: '/account/subscription' },
 * });
 * // Endpoints:
 * // GET /api/stripe/checkout?priceId={id}
 * // GET /api/stripe/portal
 * // GET /api/stripe/update?subscriptionId={id}&cancelAtPeriodEnd={bool}
 * // GET /api/stripe/donation?amount={cents}
 * ```
 */
export function createStripeEndpoints(config: StripeEndpointConfig, basePath: string = '/stripe'): Endpoint[] {
  return [
    {
      path: `${basePath}/checkout`,
      method: 'get',
      handler: createCheckoutHandler(config)
    },
    {
      path: `${basePath}/portal`,
      method: 'get',
      handler: createPortalHandler(config)
    },
    {
      path: `${basePath}/update`,
      method: 'get',
      handler: createUpdateHandler(config)
    },
    {
      path: `${basePath}/donation`,
      method: 'get',
      handler: createDonationHandler(config)
    }
  ]
}
