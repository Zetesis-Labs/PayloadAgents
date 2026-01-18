import type { Endpoint } from "payload";
import type { StripeEndpointConfig } from "../plugin/stripe-inventory-types.js";
import { createCheckoutHandler } from "./handlers/checkout-handler.js";
import { createDonationHandler } from "./handlers/donation-handler.js";
import { createPortalHandler } from "./handlers/portal-handler.js";
import { createUpdateHandler } from "./handlers/update-handler.js";

export * from "./handlers/checkout-handler.js";
export * from "./handlers/donation-handler.js";
export * from "./handlers/portal-handler.js";
export * from "./handlers/update-handler.js";
export * from "./validators/index.js";

/**
 * Creates all Stripe inventory endpoints
 *
 * @param config - Endpoint configuration
 * @param basePath - Base path for endpoints (default: '/stripe')
 * @returns Array of Payload endpoints
 *
 * @example
 * ```typescript
 * const endpoints = createStripeEndpoints({
 *   routes: { subscriptionPageHref: '/account/subscription' },
 * });
 * // Endpoints:
 * // GET /api/stripe/checkout?priceId={id}
 * // GET /api/stripe/portal
 * // GET /api/stripe/update?subscriptionId={id}&cancelAtPeriodEnd={bool}
 * // GET /api/stripe/donation?amount={cents}
 * ```
 */
export function createStripeEndpoints(
  config: StripeEndpointConfig,
  basePath: string = "/stripe"
): Endpoint[] {
  return [
    {
      path: `${basePath}/checkout`,
      method: "get",
      handler: createCheckoutHandler(config),
    },
    {
      path: `${basePath}/portal`,
      method: "get",
      handler: createPortalHandler(config),
    },
    {
      path: `${basePath}/update`,
      method: "get",
      handler: createUpdateHandler(config),
    },
    {
      path: `${basePath}/donation`,
      method: "get",
      handler: createDonationHandler(config),
    },
  ];
}
