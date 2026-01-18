import type { PayloadHandler, PayloadRequest } from "payload";
import type Stripe from "stripe";
import type { StripeEndpointConfig } from "../../plugin/stripe-inventory-types.js";
import { upsertCustomerInventoryAndSyncWithUser } from "../../utils/payload/upsert-customer-inventory-and-sync-with-user.js";
import { getCustomerFromStripeOrCreate } from "../../utils/stripe/get-customer-from-stripe-or-create.js";
import { stripeBuilder } from "../../utils/stripe/stripe-builder.js";
import {
  errorResponse,
  jsonResponse,
  validateAuthenticatedRequest,
} from "../validators/request-validator.js";

/**
 * Creates a handler for one-time donation payments
 *
 * @param config - Endpoint configuration
 * @returns PayloadHandler for donation endpoint
 */
export function createDonationHandler(config: StripeEndpointConfig): PayloadHandler {
  return async (request: PayloadRequest): Promise<Response> => {
    try {
      // Validate authenticated user
      const validated = await validateAuthenticatedRequest(request, config);
      if (!validated.success) {
        return validated.error;
      }

      const { user, payload } = validated;

      // Extract amount from query params
      const url = new URL(request.url || "");
      const amountParam = url.searchParams.get("amount");

      if (!amountParam) {
        return errorResponse("amount is required", 400);
      }

      const amount = parseInt(amountParam, 10);

      if (isNaN(amount) || amount < 100) {
        return errorResponse("Minimum donation amount is 1 EUR (100 cents)", 400);
      }

      const stripe = stripeBuilder();

      // Get or create Stripe customer
      const customerId = await getCustomerFromStripeOrCreate(
        user.email!,
        user.name
      );

      // Sync customer inventory
      await upsertCustomerInventoryAndSyncWithUser(
        payload,
        user.customer?.inventory,
        user.email!,
        customerId
      );

      // Determine redirect URLs
      const donationPageHref = config.routes.donationPageHref || config.routes.subscriptionPageHref;

      // Prepare metadata
      const metadata: Stripe.MetadataParam = {
        type: "donation",
      };

      // Create checkout session for one-time payment
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "eur",
              product_data: {
                name: "Donation",
                description: "One-time donation",
              },
              unit_amount: amount,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${process.env.DOMAIN}${donationPageHref}?success=donation`,
        cancel_url: `${process.env.DOMAIN}${donationPageHref}?error=donation_cancelled`,
        metadata,
        payment_intent_data: { metadata },
        invoice_creation: { enabled: true, invoice_data: { metadata } },
      });

      return jsonResponse({ url: session.url });
    } catch (error) {
      console.error("[Stripe Donation Error]", error);
      return errorResponse(
        error instanceof Error ? error.message : "Unknown error occurred",
        500
      );
    }
  };
}
