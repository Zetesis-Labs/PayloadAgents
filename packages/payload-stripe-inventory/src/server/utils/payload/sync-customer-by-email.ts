import type { Payload } from 'payload'
import { COLLECTION_SLUG_CUSTOMERS, COLLECTION_SLUG_USER } from '../../../model'

export async function syncCustomerByEmail({ email, payload }: { email: string; payload: Payload }) {
  const customers = await payload.find({
    collection: COLLECTION_SLUG_CUSTOMERS,
    where: { email: { equals: email } }
  })
  const customerId = customers.docs?.[0]?.id

  await payload.update({
    collection: COLLECTION_SLUG_USER,
    data: {
      customer: customerId
    },
    where: { email: { equals: email } }
  })
}
