import { createCustomerAtStripe } from "./create-customer-at-stripe";
import { getCustomer } from "./get-customer";
import { stripeBuilder } from "./stripe-builder";

export async function getCustomerFromStripeOrCreate(
  email: string,
  name?: string,
): Promise<string> {
  const stripe = stripeBuilder();
  let customer = await getCustomer({ stripe, email });
  if (!customer) {
    customer = await createCustomerAtStripe({ stripe, email, name });
  }
  return customer.id;
}
