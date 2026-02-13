import type { PayloadHandler, PayloadRequest } from 'payload'
import type { CustomerInventory } from '../../../types'
import type { StripeEndpointConfig } from '../../plugin/stripe-inventory-types'
import { upsertCustomerInventoryAndSyncWithUser } from '../../utils/payload/upsert-customer-inventory-and-sync-with-user'
import { stripeBuilder } from '../../utils/stripe/stripe-builder'
import { errorResponse, redirectResponse, validateAuthenticatedRequest } from '../validators/request-validator'

/**
 * Creates a handler for updating Stripe subscriptions (cancel at period end)
 *
 * @param config - Endpoint configuration
 * @returns PayloadHandler for update endpoint
 */
export function createUpdateHandler(config: StripeEndpointConfig): PayloadHandler {
  return async (request: PayloadRequest): Promise<Response> => {
    try {
      // Validate authenticated user
      const validated = await validateAuthenticatedRequest(request, config)
      if (!validated.success) {
        return validated.error
      }

      const { user, payload } = validated

      // Extract params
      const url = new URL(request.url || '')
      const subscriptionId = url.searchParams.get('subscriptionId')
      const cancelAtPeriodEnd = url.searchParams.get('cancelAtPeriodEnd') === 'true'

      if (!subscriptionId) {
        return errorResponse('subscriptionId is required', 400)
      }

      // Validate subscription ID format
      if (!subscriptionId.startsWith('sub_')) {
        return errorResponse('Invalid subscription ID format', 400)
      }

      const stripe = stripeBuilder()

      // Get current subscription state for potential rollback
      const originalSubscription = await stripe.subscriptions.retrieve(subscriptionId)
      const originalCancelAtPeriodEnd = originalSubscription.cancel_at_period_end

      // Update subscription in Stripe
      await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: cancelAtPeriodEnd
      })

      // Update local inventory (user.customer is a Payload relationship populated at runtime)
      const customer = user.customer as Record<string, unknown> | undefined
      const email = typeof customer?.email === 'string' ? customer.email : undefined
      const stripeId = typeof customer?.stripeId === 'string' ? customer.stripeId : undefined
      const inventory = (customer?.inventory ?? null) as CustomerInventory | null

      if (inventory?.subscriptions?.[subscriptionId]) {
        inventory.subscriptions[subscriptionId].cancel_at_period_end = cancelAtPeriodEnd
      }

      // Sync inventory with rollback on failure
      if (email && stripeId) {
        try {
          await upsertCustomerInventoryAndSyncWithUser(payload, inventory, email, stripeId, config.userSlug)
        } catch (syncError) {
          // Rollback Stripe change if local sync fails
          request.payload.logger.error({
            err: syncError,
            msg: '[Stripe Update] Local sync failed, rolling back Stripe change'
          })
          await stripe.subscriptions.update(subscriptionId, {
            cancel_at_period_end: originalCancelAtPeriodEnd
          })
          throw syncError
        }
      }

      // Redirect back to subscription page
      return redirectResponse(`${config.domain}${config.routes.subscriptionPageHref}?refresh=${Date.now()}`, 303)
    } catch (error) {
      request.payload.logger.error({ err: error, msg: '[Stripe Update Error]' })
      return errorResponse(error instanceof Error ? error.message : 'Unknown error occurred', 500)
    }
  }
}
