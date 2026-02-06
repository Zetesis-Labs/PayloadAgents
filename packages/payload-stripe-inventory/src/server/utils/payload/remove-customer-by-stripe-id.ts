import { Payload } from "payload";
import { COLLECTION_SLUG_CUSTOMERS } from "../../../model";

export async function removeCustomerByStripeId({
  stripeId,
  payload,
}: {
  stripeId: string;
  payload: Payload;
}) {
  await payload.delete({
    collection: COLLECTION_SLUG_CUSTOMERS,
    where: { stripeId: { equals: stripeId } },
  });
  payload.logger.info(
    `✅ Successfully removed customer with Stripe ID: ${stripeId}`,
  );
}
