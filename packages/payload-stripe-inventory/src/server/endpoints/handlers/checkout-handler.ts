import type { PayloadHandler, PayloadRequest } from "payload";
import type Stripe from "stripe";
import type { StripeEndpointConfig } from "../../plugin/stripe-inventory-types.js";
import { upsertCustomerInventoryAndSyncWithUser } from "../../utils/payload/upsert-customer-inventory-and-sync-with-user.js";
import { getCustomerFromStripeOrCreate } from "../../utils/stripe/get-customer-from-stripe-or-create.js";
import { stripeBuilder } from "../../utils/stripe/stripe-builder.js";
import {
  errorResponse,
  redirectResponse,
  validateAuthenticatedRequest,
} from "../validators/request-validator.js";

/**
 * Creates a handler for Stripe checkout sessions (subscriptions)
 *
 * @param config - Endpoint configuration
 * @returns PayloadHandler for checkout endpoint
 */
export function createCheckoutHandler(config: StripeEndpointConfig): PayloadHandler {
  return async (request: PayloadRequest): Promise<Response> => {
    try {
      // Validate authenticated user
      const validated = await validateAuthenticatedRequest(request, config);
      if (!validated.success) {
        return validated.error;
      }

      const { user, payload } = validated;

      // Extract priceId from query params
      const url = new URL(request.url || "");
      const priceId = url.searchParams.get("priceId");

      if (!priceId) {
        return errorResponse("priceId is required", 400);
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

      // Prepare checkout session
      const metadata: Stripe.MetadataParam = {
        type: "subscription",
      };

      const checkoutResult = await stripe.checkout.sessions.create({
        success_url: `${process.env.DOMAIN}${config.routes.subscriptionPageHref}?success=${Date.now()}`,
        cancel_url: `${process.env.DOMAIN}${config.routes.subscriptionPageHref}?error=${Date.now()}`,
        mode: "subscription",
        customer: customerId,
        client_reference_id: String(user.id),
        line_items: [{ price: priceId, quantity: 1 }],
        metadata,
        tax_id_collection: { enabled: true },
        customer_update: {
          name: "auto",
          address: "auto",
          shipping: "auto",
        },
        subscription_data: { metadata },
      });

      if (checkoutResult.url) {
        return redirectResponse(checkoutResult.url, 303);
      }

      return errorResponse("Failed to create checkout URL", 406);
    } catch (error) {
      console.error("[Stripe Checkout Error]", error);
      return errorResponse(
        error instanceof Error ? error.message : "Unknown error occurred",
        500
      );
    }
  };
}
