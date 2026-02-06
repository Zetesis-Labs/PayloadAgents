import { Payload } from "payload";
import Stripe from "stripe";
import { COLLECTION_SLUG_CUSTOMERS } from "../..";

export const customerDeleted = async (
  customer: Stripe.Customer,
  payload: Payload,
) => {
  const { id, email } = customer;
  try {
    await payload.delete({
      collection: COLLECTION_SLUG_CUSTOMERS,
      where: { email: { equals: email } },
    });
    payload.logger.info(
      `✅ Successfully deleted customer with Stripe ID: ${id}`,
    );
  } catch (error) {
    payload.logger.error(`- Error deleting subscription: ${error}`);
    throw error;
  }
};
