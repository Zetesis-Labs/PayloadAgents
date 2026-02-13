import type { CollectionSlug, Payload } from 'payload'

interface Props {
  email: string
  payload: Payload
  userSlug: CollectionSlug
}

/**
 * Gets a user ID by email address using Payload's find method
 * @param email - The email address to search for
 * @returns The user ID if found, null otherwise
 */
export async function getUserIdByEmail({ email, payload, userSlug }: Props): Promise<string | null | undefined> {
  const userQuery = await payload.find({
    collection: userSlug,
    where: {
      email: { equals: email }
    }
  })

  const user = userQuery.docs?.at(0)
  return user?.id as string | null
}
