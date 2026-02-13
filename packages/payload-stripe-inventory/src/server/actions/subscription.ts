import type { CollectionSlug, Payload } from 'payload'
import type Stripe from 'stripe'
import { COLLECTION_SLUG_PRODUCTS, generateCustomerInventory } from '../../model'
import type { CustomerInventory } from '../../types'
import type { ResolveSubscriptionPermissions } from '../plugin/stripe-inventory-types'
import { findOrCreateCustomer } from '../utils/payload/find-or-create-customer'
import { getUserIdByEmail } from '../utils/payload/get-userId-by-email'
import { removeCustomerByStripeId } from '../utils/payload/remove-customer-by-stripe-id'
import { upsertCustomerInventoryAndSyncWithUser } from '../utils/payload/upsert-customer-inventory-and-sync-with-user'
import { resolveStripeCustomer } from '../utils/stripe/get-customer'

export const subscriptionUpsert = async <TProduct = unknown>(
  subscription: Stripe.Subscription,
  payload: Payload,
  onSubscriptionUpdate: (type: 'create' | 'delete', userId: string) => Promise<void>,
  resolveSubscriptionPermissions: ResolveSubscriptionPermissions<TProduct>,
  userSlug: CollectionSlug
) => {
  const { id: stripeID, status, customer: stripeCustomer } = subscription
  const customer = await resolveStripeCustomer({ customer: stripeCustomer })
  const error = (message: string) => payload.logger.error(`Subscription Upsert: ${message}`)
  const info = (message: string) => payload.logger.info(`Subscription Upsert: ${message}`)

  if (!customer) {
    error('No stripe customer found for subscription')
    return
  }
  if (customer.deleted) {
    await removeCustomerByStripeId({ stripeId: customer.id, payload })
    return
  }
  if (!customer.email) {
    error('No email found for stripe customer')
    return
  }
  const email = customer.email
  const stripeId = customer.id

  try {
    const customer = await findOrCreateCustomer({
      email,
      payload,
      stripeId
    })

    const item = subscription.items.data.at(0)
    if (!item || !customer) {
      error(`No item ${item} or customer ${customer} found`)
      return
    }

    const { docs: products } = await payload.find({
      collection: COLLECTION_SLUG_PRODUCTS,
      where: { stripeID: { equals: item.price.product } }
    })
    const product = products.at(0)
    if (!product) {
      error(`No product found for subscription item price product: ${item.price.product}`)
      return
    }

    const inventory = customer.inventory
    inventory.subscriptions[stripeID] = {
      ...subscription,
      permissions: await resolveSubscriptionPermissions(subscription, product as TProduct, payload)
    }
    info(`Updated inventory for subscription ${stripeID}`)
    await upsertCustomerInventoryAndSyncWithUser(payload, inventory, email, stripeId, userSlug)

    if (['active', 'trialing'].includes(status)) {
      const userId = await getUserIdByEmail({ email, payload, userSlug })
      if (!userId) {
        error(`No user found for email ${email} to notify subscription update`)
        return
      }
      await onSubscriptionUpdate('create', userId)
    }
    info(`✅ Successfully updated subscription with ID: ${stripeID} for user: ${email}`)
  } catch (e) {
    error(`- Error managing subscription: ${e}`)
    throw e
  }
}

export const subscriptionDeleted = async (
  subscription: Stripe.Subscription,
  payload: Payload,
  onSubscriptionUpdate: (type: 'create' | 'delete', userId: string) => Promise<void>,
  userSlug: CollectionSlug
) => {
  const { id, customer: customerId } = subscription
  const customer = await resolveStripeCustomer({ customer: customerId })
  const stripeId = customer?.id
  if (!customer) {
    payload.logger.error('No stripe customer found for subscription')
    return
  }
  if (customer.deleted) {
    await removeCustomerByStripeId({ stripeId: customer.id, payload })
    return
  }
  if (!customer.email) {
    payload.logger.error('No email found for stripe customer')
    return
  }
  const email = customer.email
  try {
    const customer = await findOrCreateCustomer({
      email,
      payload,
      stripeId
    })
    if (!customer) {
      payload.logger.error('No customer found for subscription')
      return
    }

    const inventory: CustomerInventory = customer.inventory ?? generateCustomerInventory()
    delete inventory.subscriptions[id]

    await upsertCustomerInventoryAndSyncWithUser(payload, inventory, email, stripeId, userSlug)
    const userId = await getUserIdByEmail({ email, payload, userSlug })
    if (!userId) {
      payload.logger.error('No user found for subscription')
      return
    }
    await onSubscriptionUpdate('delete', userId)

    payload.logger.info(`✅ Successfully deleted subscription: ${id} for user: ${email}`)
  } catch (error) {
    payload.logger.error(`- Error deleting subscription: ${error}`)
    throw error
  }
}
