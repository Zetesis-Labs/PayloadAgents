import Stripe from "stripe";
import { stripeBuilder } from "./stripe-builder";

export async function createCustomerAtStripe({
  stripe,
  email,
  name,
}: {
  stripe?: Stripe;
  email: string;
  name?: string;
}) {
  stripe = stripe ?? stripeBuilder();
  return await stripe.customers.create({
    email: email,
    name: name || undefined,
  });
}
