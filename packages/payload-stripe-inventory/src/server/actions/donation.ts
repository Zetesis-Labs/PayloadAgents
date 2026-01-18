import { Payload } from "payload";
import type Stripe from "stripe";
import { COLLECTION_SLUG_CUSTOMERS, generateCustomerInventory } from "../../model/index.js";
import { resolveStripeCustomer } from "../utils/stripe/get-customer.js";
import { findOrCreateCustomer } from "../utils/payload/find-or-create-customer.js";
import { removeCustomerByStripeId } from "../utils/payload/remove-customer-by-stripe-id.js";

export const paymentSucceeded = async (
  paymentIntent: Stripe.PaymentIntent,
  payload: Payload
) => {
  const { id, customer: paymentCustomer } = paymentIntent;
  const stripeCustomer = await resolveStripeCustomer({ customer: paymentCustomer });
  if (!stripeCustomer) {
    payload.logger.error("No stripe customer found for payment");
    return
  }
  if (stripeCustomer.deleted) {
    await removeCustomerByStripeId({ stripeId: stripeCustomer.id, payload });
    return;
  }
  if (!stripeCustomer.email) {
    payload.logger.error("No email found for stripe customer");
    return;
  }

  try {
    const customer = await findOrCreateCustomer({
      email: stripeCustomer.email,
      payload,
      stripeId: stripeCustomer.id,
    });
    if (!customer) {
      payload.logger.error(`Customer not found for payment: ${stripeCustomer.email}`);
      return;
    }

    const inventory = customer.inventory ?? generateCustomerInventory();
    inventory.payments[id] = paymentIntent;

    await payload.update({
      collection: COLLECTION_SLUG_CUSTOMERS,
      data: { inventory: inventory as unknown as { [x: string]: {} } },
      where: { email: { equals: stripeCustomer.email } },
    });

    payload.logger.info(
      `✅ Successfully recorded ${stripeCustomer.metadata?.type ?? "subscription"} with Payment Intent ID: ${id} for user: ${stripeCustomer.email}`
    );
  } catch (error) {
    payload.logger.error(`- Error recording payment: ${error}`);
    throw error;
  }
};
