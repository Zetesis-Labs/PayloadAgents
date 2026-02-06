import { Payload } from "payload";
import { COLLECTION_SLUG_USER } from "../../../model";

interface Props {
  email: string;
  payload: Payload;
}

/**
 * Gets a user ID by email address using Payload's find method
 * @param email - The email address to search for
 * @returns The user ID if found, null otherwise
 */
export async function getUserIdByEmail({
  email,
  payload,
}: Props): Promise<string | null | undefined> {
  const userQuery = await payload.find({
    collection: COLLECTION_SLUG_USER,
    where: {
      email: { equals: email },
    },
  });

  const user = userQuery.docs?.[0];
  return user?.id as string | null;
}
