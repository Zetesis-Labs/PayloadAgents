import type { Payload, TypedUser } from 'payload'
import type Stripe from 'stripe'
import type { StripeEndpointConfig } from '../../plugin/stripe-inventory-types'
import { upsertCustomerInventoryAndSyncWithUser } from '../../utils/payload/upsert-customer-inventory-and-sync-with-user'
import { getCustomerFromStripeOrCreate } from '../../utils/stripe/get-customer-from-stripe-or-create'
import { stripeBuilder } from '../../utils/stripe/stripe-builder'

/**
 * Initializes a Stripe client and ensures the user has a synced Stripe customer.
 * Shared by checkout, portal, and donation handlers.
 */
export async function ensureStripeCustomer(
  user: TypedUser,
  email: string,
  payload: Payload,
  config: StripeEndpointConfig
): Promise<{ stripe: Stripe; customerId: string }> {
  const stripe = stripeBuilder()
  const customerId = await getCustomerFromStripeOrCreate(email, user.name)
  await upsertCustomerInventoryAndSyncWithUser(payload, user.customer?.inventory, email, customerId, config.userSlug)
  return { stripe, customerId }
}
