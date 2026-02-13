import type { BasePayload, PayloadHandler, PayloadRequest } from 'payload'
import type Stripe from 'stripe'
import type { CustomerInventory } from '../../../types'
import type { StripeEndpointConfig } from '../../plugin/stripe-inventory-types'
import { upsertCustomerInventoryAndSyncWithUser } from '../../utils/payload/upsert-customer-inventory-and-sync-with-user'
import { stripeBuilder } from '../../utils/stripe/stripe-builder'
import { errorResponse, redirectResponse, validateAuthenticatedRequest } from '../validators/request-validator'

interface SubscriptionParams {
  subscriptionId: string
  cancelAtPeriodEnd: boolean
}

interface CustomerData {
  email: string | undefined
  stripeId: string | undefined
  inventory: CustomerInventory | null
}

function parseSubscriptionParams(request: PayloadRequest): SubscriptionParams | Response {
  const url = new URL(request.url || '')
  const subscriptionId = url.searchParams.get('subscriptionId')
  const cancelAtPeriodEnd = url.searchParams.get('cancelAtPeriodEnd') === 'true'

  if (!subscriptionId) {
    return errorResponse('subscriptionId is required', 400)
  }

  if (!subscriptionId.startsWith('sub_')) {
    return errorResponse('Invalid subscription ID format', 400)
  }

  return { subscriptionId, cancelAtPeriodEnd }
}

function extractCustomerData(user: Record<string, unknown>): CustomerData {
  const customer = user.customer as Record<string, unknown> | undefined
  return {
    email: typeof customer?.email === 'string' ? customer.email : undefined,
    stripeId: typeof customer?.stripeId === 'string' ? customer.stripeId : undefined,
    inventory: (customer?.inventory ?? null) as CustomerInventory | null
  }
}

function updateLocalInventory(
  inventory: CustomerInventory | null,
  subscriptionId: string,
  cancelAtPeriodEnd: boolean
): void {
  if (inventory?.subscriptions?.[subscriptionId]) {
    inventory.subscriptions[subscriptionId].cancel_at_period_end = cancelAtPeriodEnd
  }
}

async function syncInventoryWithRollback(
  payload: BasePayload,
  stripe: Stripe,
  customerData: CustomerData,
  subscriptionId: string,
  originalCancelAtPeriodEnd: boolean,
  config: StripeEndpointConfig,
  logger: PayloadRequest['payload']['logger']
): Promise<void> {
  const { email, stripeId, inventory } = customerData
  if (!email || !stripeId) return

  try {
    await upsertCustomerInventoryAndSyncWithUser(payload, inventory, email, stripeId, config.userSlug)
  } catch (syncError) {
    logger.error({
      err: syncError,
      msg: '[Stripe Update] Local sync failed, rolling back Stripe change'
    })
    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: originalCancelAtPeriodEnd
    })
    throw syncError
  }
}

/**
 * Creates a handler for updating Stripe subscriptions (cancel at period end)
 *
 * @param config - Endpoint configuration
 * @returns PayloadHandler for update endpoint
 */
export function createUpdateHandler(config: StripeEndpointConfig): PayloadHandler {
  return async (request: PayloadRequest): Promise<Response> => {
    try {
      const validated = await validateAuthenticatedRequest(request, config)
      if (!validated.success) {
        return validated.error
      }

      const { user, payload } = validated

      const params = parseSubscriptionParams(request)
      if (params instanceof Response) {
        return params
      }

      const { subscriptionId, cancelAtPeriodEnd } = params
      const stripe = stripeBuilder()

      const originalSubscription = await stripe.subscriptions.retrieve(subscriptionId)
      const originalCancelAtPeriodEnd = originalSubscription.cancel_at_period_end

      await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: cancelAtPeriodEnd
      })

      const customerData = extractCustomerData(user)
      updateLocalInventory(customerData.inventory, subscriptionId, cancelAtPeriodEnd)

      await syncInventoryWithRollback(
        payload,
        stripe,
        customerData,
        subscriptionId,
        originalCancelAtPeriodEnd,
        config,
        request.payload.logger
      )

      return redirectResponse(`${config.domain}${config.routes.subscriptionPageHref}?refresh=${Date.now()}`, 303)
    } catch (error) {
      request.payload.logger.error({ err: error, msg: '[Stripe Update Error]' })
      return errorResponse(error instanceof Error ? error.message : 'Unknown error occurred', 500)
    }
  }
}
