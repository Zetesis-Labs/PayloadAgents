import type { PayloadHandler, PayloadRequest } from 'payload'
import type Stripe from 'stripe'
import type { StripeEndpointConfig } from '../../plugin/stripe-inventory-types'
import { errorResponse, redirectResponse, validateAuthenticatedRequest } from '../validators/request-validator'
import { ensureStripeCustomer } from './ensure-stripe-customer'

/**
 * Creates a handler for Stripe checkout sessions (subscriptions)
 *
 * @param config - Endpoint configuration
 * @returns PayloadHandler for checkout endpoint
 */
export function createCheckoutHandler(config: StripeEndpointConfig): PayloadHandler {
  return async (request: PayloadRequest): Promise<Response> => {
    try {
      const validated = await validateAuthenticatedRequest(request, config)
      if (!validated.success) {
        return validated.error
      }

      const { user, payload } = validated

      if (!user.email) {
        return errorResponse('User email is required', 400)
      }

      const url = new URL(request.url || '')
      const priceId = url.searchParams.get('priceId')

      if (!priceId) {
        return errorResponse('priceId is required', 400)
      }

      const { stripe, customerId } = await ensureStripeCustomer(user, user.email, payload, config)

      const metadata: Stripe.MetadataParam = {
        type: 'subscription'
      }

      const checkoutResult = await stripe.checkout.sessions.create({
        success_url: `${config.domain}${config.routes.subscriptionPageHref}?success=${Date.now()}`,
        cancel_url: `${config.domain}${config.routes.subscriptionPageHref}?error=${Date.now()}`,
        mode: 'subscription',
        customer: customerId,
        client_reference_id: String(user.id),
        line_items: [{ price: priceId, quantity: 1 }],
        metadata,
        tax_id_collection: { enabled: true },
        customer_update: {
          name: 'auto',
          address: 'auto',
          shipping: 'auto'
        },
        subscription_data: { metadata }
      })

      if (checkoutResult.url) {
        return redirectResponse(checkoutResult.url, 303)
      }

      return errorResponse('Failed to create checkout URL', 406)
    } catch (error) {
      request.payload.logger.error({ err: error, msg: '[Stripe Checkout Error]' })
      return errorResponse(error instanceof Error ? error.message : 'Unknown error occurred', 500)
    }
  }
}
