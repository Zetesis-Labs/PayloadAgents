import type { PayloadHandler, PayloadRequest } from "payload";
import type Stripe from "stripe";
import type { StripeEndpointConfig } from "../../plugin/stripe-inventory-types";
import { upsertCustomerInventoryAndSyncWithUser } from "../../utils/payload/upsert-customer-inventory-and-sync-with-user";
import { getCustomerFromStripeOrCreate } from "../../utils/stripe/get-customer-from-stripe-or-create";
import { stripeBuilder } from "../../utils/stripe/stripe-builder";
import {
  errorResponse,
  redirectResponse,
  validateAuthenticatedRequest,
} from "../validators/request-validator";

/**
 * Creates a handler for Stripe Billing Portal access
 *
 * @param config - Endpoint configuration
 * @returns PayloadHandler for portal endpoint
 */
export function createPortalHandler(
  config: StripeEndpointConfig,
): PayloadHandler {
  return async (request: PayloadRequest): Promise<Response> => {
    try {
      // Validate authenticated user
      const validated = await validateAuthenticatedRequest(request, config);
      if (!validated.success) {
        return validated.error;
      }

      const { user, payload } = validated;

      // Validate user email
      if (!user.email) {
        return errorResponse("User email is required", 400);
      }

      // Extract optional params for subscription actions
      const url = new URL(request.url || "");
      const cancelSubscriptionId = url.searchParams.get("cancelSubscriptionId");
      const updateSubscriptionId = url.searchParams.get("updateSubscriptionId");

      // Validate subscription ID format if provided (Stripe IDs start with 'sub_')
      if (cancelSubscriptionId && !cancelSubscriptionId.startsWith("sub_")) {
        return errorResponse("Invalid subscription ID format", 400);
      }
      if (updateSubscriptionId && !updateSubscriptionId.startsWith("sub_")) {
        return errorResponse("Invalid subscription ID format", 400);
      }

      // Build flow data if subscription action is requested
      let flowData:
        | Stripe.BillingPortal.SessionCreateParams.FlowData
        | undefined;

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
        user.email,
        user.name,
      );

      // Sync customer inventory
      await upsertCustomerInventoryAndSyncWithUser(
        payload,
        user.customer?.inventory,
        user.email,
        customerId,
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
        500,
      );
    }
  };
}
