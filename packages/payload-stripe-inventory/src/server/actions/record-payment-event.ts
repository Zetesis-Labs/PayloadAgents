import type { Payload } from 'payload'
import type Stripe from 'stripe'
import { COLLECTION_SLUG_CUSTOMERS, generateCustomerInventory } from '../../model'
import type { CustomerInventory } from '../../types'
import { findOrCreateCustomer } from '../utils/payload/find-or-create-customer'
import { removeCustomerByStripeId } from '../utils/payload/remove-customer-by-stripe-id'
import { resolveStripeCustomer } from '../utils/stripe/get-customer'

type InventoryKey = keyof Pick<CustomerInventory, 'payments' | 'invoices'>

/**
 * Records a Stripe payment event (payment intent or invoice) into the customer inventory.
 *
 * @param event - The Stripe event object (PaymentIntent or Invoice)
 * @param payload - Payload instance
 * @param inventoryKey - Which inventory bucket to store in ('payments' | 'invoices')
 */
export const recordPaymentEvent = async (
  event: Stripe.PaymentIntent | Stripe.Invoice,
  payload: Payload,
  inventoryKey: InventoryKey
) => {
  const id = event.id
  if (!id) {
    payload.logger.error(`Missing id for ${inventoryKey} event`)
    return
  }
  const stripeCustomer = await resolveStripeCustomer({ customer: event.customer })

  if (!stripeCustomer) {
    payload.logger.error(`No stripe customer found for ${inventoryKey} event`)
    return
  }
  if (stripeCustomer.deleted) {
    await removeCustomerByStripeId({ stripeId: stripeCustomer.id, payload })
    return
  }
  if (!stripeCustomer.email) {
    payload.logger.error(`No email found for stripe customer (${inventoryKey} event)`)
    return
  }

  try {
    const customer = await findOrCreateCustomer({
      email: stripeCustomer.email,
      payload,
      stripeId: stripeCustomer.id
    })
    if (!customer) {
      payload.logger.error(`Customer not found for ${inventoryKey} event: ${stripeCustomer.email}`)
      return
    }

    const inventory = customer.inventory ?? generateCustomerInventory()
    ;(inventory[inventoryKey] as Record<string, unknown>)[id] = event

    await payload.update({
      collection: COLLECTION_SLUG_CUSTOMERS,
      data: { inventory },
      where: { email: { equals: stripeCustomer.email } }
    })

    payload.logger.info(`Successfully recorded ${inventoryKey} event ${id} for user: ${stripeCustomer.email}`)
  } catch (error) {
    payload.logger.error(`Error recording ${inventoryKey} event: ${error}`)
    throw error
  }
}
