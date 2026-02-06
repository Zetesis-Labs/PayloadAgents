import { Payload } from "payload";
import {
  COLLECTION_SLUG_CUSTOMERS,
  generateCustomerInventory,
} from "../../../model";
import type { CustomerInventory } from "../../../types";
import { syncCustomerByEmail } from "./sync-customer-by-email";
import { payloadUpsert } from "./upsert";

export async function upsertCustomerInventoryAndSyncWithUser(
  payload: Payload,
  inventory: CustomerInventory | null | undefined,
  email: string,
  stripeCustomerId?: string | null,
) {
  await payloadUpsert({
    payload,
    collection: COLLECTION_SLUG_CUSTOMERS,
    data: {
      email: email,
      stripeId: stripeCustomerId,
      inventory: inventory ?? generateCustomerInventory(),
    },
    where: { email: { equals: email } },
  });
  await syncCustomerByEmail({ email, payload });
}
