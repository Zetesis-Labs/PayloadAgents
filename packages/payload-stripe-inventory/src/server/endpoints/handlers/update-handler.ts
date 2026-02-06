import type { PayloadHandler, PayloadRequest } from "payload";
import type { Customer, CustomerInventory } from "../../../types";
import type { StripeEndpointConfig } from "../../plugin/stripe-inventory-types";
import { upsertCustomerInventoryAndSyncWithUser } from "../../utils/payload/upsert-customer-inventory-and-sync-with-user";
import { stripeBuilder } from "../../utils/stripe/stripe-builder";
import {
  errorResponse,
  redirectResponse,
  validateAuthenticatedRequest,
} from "../validators/request-validator";

/**
 * Creates a handler for updating Stripe subscriptions (cancel at period end)
 *
 * @param config - Endpoint configuration
 * @returns PayloadHandler for update endpoint
 */
export function createUpdateHandler(
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

      // Extract params
      const url = new URL(request.url || "");
      const subscriptionId = url.searchParams.get("subscriptionId");
      const cancelAtPeriodEnd =
        url.searchParams.get("cancelAtPeriodEnd") === "true";

      if (!subscriptionId) {
        return errorResponse("subscriptionId is required", 400);
      }

      // Validate subscription ID format
      if (!subscriptionId.startsWith("sub_")) {
        return errorResponse("Invalid subscription ID format", 400);
      }

      const stripe = stripeBuilder();

      // Get current subscription state for potential rollback
      const originalSubscription =
        await stripe.subscriptions.retrieve(subscriptionId);
      const originalCancelAtPeriodEnd =
        originalSubscription.cancel_at_period_end;

      // Update subscription in Stripe
      await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: cancelAtPeriodEnd,
      });

      // Update local inventory
      const customer = user.customer as Customer | undefined;
      const inventory = customer?.inventory as CustomerInventory | null;

      if (inventory?.subscriptions?.[subscriptionId]) {
        inventory.subscriptions[subscriptionId].cancel_at_period_end =
          cancelAtPeriodEnd;
      }

      // Sync inventory with rollback on failure
      if (customer?.email) {
        try {
          await upsertCustomerInventoryAndSyncWithUser(
            payload,
            inventory,
            customer.email,
          );
        } catch (syncError) {
          // Rollback Stripe change if local sync fails
          console.error(
            "[Stripe Update] Local sync failed, rolling back Stripe change",
            syncError,
          );
          await stripe.subscriptions.update(subscriptionId, {
            cancel_at_period_end: originalCancelAtPeriodEnd,
          });
          throw syncError;
        }
      }

      // Redirect back to subscription page
      return redirectResponse(
        `${process.env.DOMAIN}${config.routes.subscriptionPageHref}?refresh=${Date.now()}`,
        303,
      );
    } catch (error) {
      console.error("[Stripe Update Error]", error);
      return errorResponse(
        error instanceof Error ? error.message : "Unknown error occurred",
        500,
      );
    }
  };
}
