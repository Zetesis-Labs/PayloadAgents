import type { PayloadRequest } from "payload";
import type { BaseUser } from "../../types/index.js";

/**
 * URL routes configuration for Stripe redirects
 */
export interface StripeInventoryRoutes {
  /** URL to redirect after subscription-related actions */
  subscriptionPageHref: string;
  /** URL to redirect after donation-related actions (optional, defaults to subscriptionPageHref) */
  donationPageHref?: string;
}

/**
 * Configuration for the Stripe Inventory plugin
 */
export interface StripeInventoryPluginConfig {
  /**
   * URL routes for redirects after Stripe operations
   */
  routes: StripeInventoryRoutes;

  /**
   * Base path for all Stripe endpoints (default: '/stripe')
   * Endpoints will be available at /api{basePath}/checkout, /api{basePath}/portal, etc.
   */
  basePath?: string;

  /**
   * Callback invoked when a subscription is created or deleted
   * @param type - The type of subscription event ('create' or 'delete')
   * @param userId - The ID of the user associated with the subscription
   */
  onSubscriptionUpdate?: (
    type: "create" | "delete",
    userId: string
  ) => Promise<void>;

  /**
   * Optional permission check for all Stripe endpoints.
   * If not provided, only checks for authenticated user.
   * @param request - The Payload request object
   * @returns true if the user has permission, false otherwise
   */
  checkPermissions?: (request: PayloadRequest) => Promise<boolean>;

  /**
   * Optional custom user resolver.
   * Use this if you need custom logic to resolve the user from the request.
   * If not provided, uses request.user.
   * @param request - The Payload request object
   * @returns The user object or null if not authenticated
   */
  resolveUser?: (request: PayloadRequest) => Promise<BaseUser | null>;
}

/**
 * Internal configuration passed to endpoint handlers
 */
export interface StripeEndpointConfig {
  routes: StripeInventoryRoutes;
  checkPermissions?: (request: PayloadRequest) => Promise<boolean>;
  resolveUser?: (request: PayloadRequest) => Promise<BaseUser | null>;
}
