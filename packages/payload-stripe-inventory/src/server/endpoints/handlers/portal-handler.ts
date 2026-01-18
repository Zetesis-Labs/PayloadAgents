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
 * Creates a handler for Stripe Billing Portal access
 *
 * @param config - Endpoint configuration
 * @returns PayloadHandler for portal endpoint
 */
export function createPortalHandler(config: StripeEndpointConfig): PayloadHandler {
  return async (request: PayloadRequest): Promise<Response> => {
    try {
      // Validate authenticated user
      const validated = await validateAuthenticatedRequest(request, config);
      if (!validated.success) {
        return validated.error;
      }

      const { user, payload } = validated;

      // Extract optional params for subscription actions
      const url = new URL(request.url || "");
      const cancelSubscriptionId = url.searchParams.get("cancelSubscriptionId");
      const updateSubscriptionId = url.searchParams.get("updateSubscriptionId");

      // Build flow data if subscription action is requested
      let flowData: Stripe.BillingPortal.SessionCreateParams.FlowData | undefined;

      if (cancelSubscriptionId) {
        flowData = {
          type: "subscription_cancel",
          subscription_cancel: { subscription: cancelSubscriptionId },
        };
      } else if (updateSubscriptionId) {
        flowData = {
          type: "subscription_update",
          subscription_update: { subscription: updateSubscriptionId },
        };
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

      // Create billing portal session
      const session = await stripe.billingPortal.sessions.create({
        flow_data: flowData,
        customer: customerId,
        return_url: `${process.env.DOMAIN}${config.routes.subscriptionPageHref}`,
      });

      return redirectResponse(session.url, 303);
    } catch (error) {
      console.error("[Stripe Portal Error]", error);
      return errorResponse(
        error instanceof Error ? error.message : "Unknown error occurred",
        500
      );
    }
  };
}
