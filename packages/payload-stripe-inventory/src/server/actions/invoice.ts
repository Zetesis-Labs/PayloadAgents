import type { Payload } from 'payload'
import type Stripe from 'stripe'
import { COLLECTION_SLUG_CUSTOMERS, generateCustomerInventory } from '../../model'
import { findOrCreateCustomer } from '../utils/payload/find-or-create-customer'
import { removeCustomerByStripeId } from '../utils/payload/remove-customer-by-stripe-id'
import { resolveStripeCustomer } from '../utils/stripe/get-customer'

export const invoiceSucceeded = async (invoiceIntent: Stripe.Invoice, payload: Payload) => {
  const { id, customer: paymentCustomer } = invoiceIntent
  const stripeCustomer = await resolveStripeCustomer({
    customer: paymentCustomer
  })
  if (!stripeCustomer) {
    payload.logger.error('No stripe customer found for payment')
    return
  }
  if (stripeCustomer.deleted) {
    await removeCustomerByStripeId({ stripeId: stripeCustomer.id, payload })
    return
  }
  if (!stripeCustomer.email) {
    payload.logger.error('No email found for stripe customer')
    return
  }

  try {
    const customer = await findOrCreateCustomer({
      email: stripeCustomer.email,
      payload,
      stripeId: stripeCustomer.id
    })
    if (!customer) {
      payload.logger.error(`Customer not found for invoice: ${stripeCustomer.email}`)
      return
    }

    const inventory = customer.inventory ?? generateCustomerInventory()
    inventory.invoices[id] = invoiceIntent

    await payload.update({
      collection: COLLECTION_SLUG_CUSTOMERS,
      data: { inventory: inventory as unknown as Record<string, Record<string, unknown>> },
      where: { email: { equals: stripeCustomer.email } }
    })

    payload.logger.info(
      `✅ Successfully recorded ${stripeCustomer.metadata?.type ?? 'subscription'} with Payment Intent ID: ${id} for user: ${stripeCustomer.email}`
    )
  } catch (error) {
    payload.logger.error(`- Error recording payment: ${error}`)
    throw error
  }
}
