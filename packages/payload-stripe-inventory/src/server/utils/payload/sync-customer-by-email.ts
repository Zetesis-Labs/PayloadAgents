import type { CollectionSlug, Payload } from 'payload'
import { COLLECTION_SLUG_CUSTOMERS } from '../../../model'

export async function syncCustomerByEmail({
  email,
  payload,
  userSlug
}: {
  email: string
  payload: Payload
  userSlug: CollectionSlug
}) {
  const customers = await payload.find({
    collection: COLLECTION_SLUG_CUSTOMERS,
    where: { email: { equals: email } }
  })
  const customerId = customers.docs?.[0]?.id

  await payload.update({
    collection: userSlug,
    data: {
      customer: customerId
    },
    where: { email: { equals: email } }
  })
}
