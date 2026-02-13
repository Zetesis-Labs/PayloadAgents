import type { PayloadHandler, PayloadRequest } from 'payload'
import type Stripe from 'stripe'
import type { StripeEndpointConfig } from '../../plugin/stripe-inventory-types'
import { errorResponse, redirectResponse, validateAuthenticatedRequest } from '../validators/request-validator'
import { ensureStripeCustomer } from './ensure-stripe-customer'

/**
 * Creates a handler for Stripe Billing Portal access
 *
 * @param config - Endpoint configuration
 * @returns PayloadHandler for portal endpoint
 */
export function createPortalHandler(config: StripeEndpointConfig): PayloadHandler {
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

      // Extract optional params for subscription actions
      const url = new URL(request.url || '')
      const cancelSubscriptionId = url.searchParams.get('cancelSubscriptionId')
      const updateSubscriptionId = url.searchParams.get('updateSubscriptionId')

      // Validate subscription ID format if provided (Stripe IDs start with 'sub_')
      if (cancelSubscriptionId && !cancelSubscriptionId.startsWith('sub_')) {
        return errorResponse('Invalid subscription ID format', 400)
      }
      if (updateSubscriptionId && !updateSubscriptionId.startsWith('sub_')) {
        return errorResponse('Invalid subscription ID format', 400)
      }

      // Build flow data if subscription action is requested
      let flowData: Stripe.BillingPortal.SessionCreateParams.FlowData | undefined

      if (cancelSubscriptionId) {
        flowData = {
          type: 'subscription_cancel',
          subscription_cancel: { subscription: cancelSubscriptionId }
        }
      } else if (updateSubscriptionId) {
        flowData = {
          type: 'subscription_update',
          subscription_update: { subscription: updateSubscriptionId }
        }
      }

      const { stripe, customerId } = await ensureStripeCustomer(user, user.email, payload, config)

      // Create billing portal session
      const session = await stripe.billingPortal.sessions.create({
        flow_data: flowData,
        customer: customerId,
        return_url: `${config.domain}${config.routes.subscriptionPageHref}`
      })

      return redirectResponse(session.url, 303)
    } catch (error) {
      console.error('[Stripe Portal Error]', error)
      return errorResponse(error instanceof Error ? error.message : 'Unknown error occurred', 500)
    }
  }
}
