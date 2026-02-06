import type { Payload } from 'payload'
import { COLLECTION_SLUG_CUSTOMERS, generateCustomerInventory } from '../../../model'
import type { Customer, CustomerInventory } from '../../../types'

interface FindOrCreateCustomerProps {
  email: string
  payload: Payload
  stripeId?: string
}

/**
 * Finds a customer by email address in the customers collection, or creates one if not found
 * @param email - The email address to search for
 * @param payload - Payload instance
 * @param stripeId - Optional Stripe customer ID to set when creating
 * @returns The customer document (found or created)
 */
export async function findOrCreateCustomer({
  email,
  payload,
  stripeId
}: FindOrCreateCustomerProps): Promise<Customer | null> {
  if (!email) {
    payload.logger.error('Email is required to find or create customer')
    return null
  }

  try {
    const userQuery = await payload.find({
      collection: COLLECTION_SLUG_CUSTOMERS,
      where: {
        email: { equals: email }
      }
    })

    const existingCustomer: Customer | null = userQuery.docs?.[0] as unknown as Customer | null
    if (existingCustomer) {
      existingCustomer.inventory = existingCustomer?.inventory
        ? (existingCustomer.inventory as unknown as CustomerInventory)
        : generateCustomerInventory()
      return existingCustomer
    }

    payload.logger.info(`Creating new customer for email: ${email}`)

    const newCustomer = await payload.create({
      collection: COLLECTION_SLUG_CUSTOMERS,
      data: {
        email,
        stripeId: stripeId || '',
        inventory: generateCustomerInventory() as unknown as [k: string]
      }
    })

    payload.logger.info(`✅ Successfully created customer for email: ${email}`)
    return newCustomer as unknown as Customer
  } catch (error) {
    payload.logger.error(`Error finding or creating customer for email ${email}: ${error}`)
    throw error
  }
}
