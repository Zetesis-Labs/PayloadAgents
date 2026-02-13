import type { Customer, CustomerInventory } from '../../../types'

/** Converts a generic Payload document to a typed Customer */
export function toCustomer(doc: Record<string, unknown> | null | undefined): Customer | null {
  if (!doc) return null
  return {
    stripeId: doc.stripeId as string,
    email: doc.email as string,
    inventory: doc.inventory as CustomerInventory
  }
}
