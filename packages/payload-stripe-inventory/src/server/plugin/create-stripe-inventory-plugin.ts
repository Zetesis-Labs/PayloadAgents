/**
 * Stripe Inventory Plugin Factory for Payload CMS
 *
 * This plugin automatically registers Stripe endpoints and webhook handlers.
 * It replaces the need for manual Next.js route handlers.
 *
 * @example
 * ```typescript
 * // payload.config.ts
 * import { createStripeInventoryPlugin } from '@nexo-labs/payload-stripe-inventory/server';
 *
 * export default buildConfig({
 *   plugins: [
 *     createStripeInventoryPlugin({
 *       routes: { subscriptionPageHref: '/account/subscription' },
 *       onSubscriptionUpdate: async (type, userId) => {
 *         console.log(`Subscription ${type} for user ${userId}`);
 *       },
 *     }),
 *   ],
 * });
 * ```
 */

import type { Config, Plugin } from "payload";
import { stripePlugin } from "@payloadcms/plugin-stripe";
import {
  priceDeleted,
  subscriptionUpsert,
  subscriptionDeleted,
  productDeleted,
  paymentSucceeded,
  invoiceSucceeded,
  customerDeleted,
} from "../actions/index.js";
import { createStripeEndpoints } from "../endpoints/index.js";
import type {
  StripeEndpointConfig,
  StripeInventoryPluginConfig,
} from "./stripe-inventory-types.js";

export type { StripeInventoryPluginConfig, StripeEndpointConfig };
export { createStripeEndpoints };

/**
 * Creates the Stripe Inventory plugin for Payload CMS
 *
 * This plugin:
 * - Registers REST endpoints for checkout, portal, update, and donation
 * - Sets up Stripe webhook handlers for subscription and payment events
 * - Syncs customer data between Stripe and Payload
 *
 * @param config - Plugin configuration
 * @returns A Payload plugin function
 *
 * Endpoints registered:
 * - GET /api{basePath}/checkout?priceId={id} - Redirect to Stripe Checkout
 * - GET /api{basePath}/portal - Redirect to Stripe Billing Portal
 * - GET /api{basePath}/update?subscriptionId={id}&cancelAtPeriodEnd={bool} - Update subscription
 * - GET /api{basePath}/donation?amount={cents} - Returns JSON with checkout URL
 */
export function createStripeInventoryPlugin(
  config: StripeInventoryPluginConfig
): Plugin {
  const basePath = config.basePath || "/stripe";

  // Build endpoint configuration
  const endpointConfig: StripeEndpointConfig = {
    routes: config.routes,
    checkPermissions: config.checkPermissions,
    resolveUser: config.resolveUser,
  };

  // Callback for subscription updates (defaults to no-op)
  const onSubscriptionUpdate =
    config.onSubscriptionUpdate ||
    (async () => {
      /* no-op */
    });

  return (incomingConfig: Config): Config => {
    // 1. Create and register Stripe endpoints
    const stripeEndpoints = createStripeEndpoints(endpointConfig, basePath);

    const configWithEndpoints: Config = {
      ...incomingConfig,
      endpoints: [...(incomingConfig.endpoints || []), ...stripeEndpoints],
    };

    // 2. Apply the base Stripe plugin with webhook handlers
    const stripePluginInstance = stripePlugin({
      isTestKey: process.env.STRIPE_SECRET_KEY?.includes("sk_test"),
      stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
      stripeWebhooksEndpointSecret: process.env.STRIPE_WEBHOOK_SECRET,
      webhooks: {
        "price.deleted": async ({ event, payload }) =>
          await priceDeleted(event.data.object, payload),
        "customer.subscription.created": async ({ event, payload }) =>
          await subscriptionUpsert(
            event.data.object,
            payload,
            onSubscriptionUpdate
          ),
        "customer.subscription.paused": async ({ event, payload }) =>
          await subscriptionUpsert(
            event.data.object,
            payload,
            onSubscriptionUpdate
          ),
        "customer.subscription.updated": async ({ event, payload }) =>
          await subscriptionUpsert(
            event.data.object,
            payload,
            onSubscriptionUpdate
          ),
        "customer.subscription.deleted": async ({ event, payload }) =>
          await subscriptionDeleted(
            event.data.object,
            payload,
            onSubscriptionUpdate
          ),
        "customer.deleted": async ({ event, payload }) =>
          await customerDeleted(event.data.object, payload),
        "product.deleted": async ({ event, payload }) =>
          await productDeleted(event.data.object, payload),
        "payment_intent.succeeded": async ({ event, payload }) => {
          await paymentSucceeded(event.data.object, payload);
        },
        "invoice.paid": async ({ event, payload }) => {
          await invoiceSucceeded(event.data.object, payload);
        },
      },
    });

    // 3. Apply the Stripe plugin to the config with endpoints
    return stripePluginInstance(configWithEndpoints);
  };
}
