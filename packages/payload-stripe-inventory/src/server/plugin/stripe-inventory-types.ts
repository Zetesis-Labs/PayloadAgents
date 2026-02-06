import type { Payload, PayloadRequest } from 'payload'
import type Stripe from 'stripe'
import type { BaseUser } from '../../types'

/**
 * URL routes configuration for Stripe redirects
 */
export interface StripeInventoryRoutes {
  /** URL to redirect after subscription-related actions */
  subscriptionPageHref: string
  /** URL to redirect after donation-related actions (optional, defaults to subscriptionPageHref) */
  donationPageHref?: string
}

/**
 * Configuration for the Stripe Inventory plugin
 * @template TProduct - The product type used by the consumer (defaults to unknown)
 * @template TContent - The content type used by the consumer (defaults to unknown)
 */
export interface StripeInventoryPluginConfig<TProduct = unknown, TContent = unknown> {
  /**
   * URL routes for redirects after Stripe operations
   */
  routes: StripeInventoryRoutes

  /**
   * Base path for all Stripe endpoints (default: '/stripe')
   * Endpoints will be available at /api{basePath}/checkout, /api{basePath}/portal, etc.
   */
  basePath?: string

  /**
   * Callback invoked when a subscription is created or deleted
   * @param type - The type of subscription event ('create' or 'delete')
   * @param userId - The ID of the user associated with the subscription
   */
  onSubscriptionUpdate?: (type: 'create' | 'delete', userId: string) => Promise<void>

  /**
   * Optional permission check for all Stripe endpoints.
   * If not provided, only checks for authenticated user.
   * @param request - The Payload request object
   * @returns true if the user has permission, false otherwise
   */
  checkPermissions?: (request: PayloadRequest) => Promise<boolean>

  /**
   * Optional custom user resolver.
   * Use this if you need custom logic to resolve the user from the request.
   * If not provided, uses request.user.
   * @param request - The Payload request object
   * @returns The user object or null if not authenticated
   */
  resolveUser?: (request: PayloadRequest) => Promise<BaseUser | null>

  /**
   * Resolves the permissions granted by a subscription.
   * This callback allows you to define how permissions are extracted from a product.
   * @param subscription - The Stripe subscription object
   * @param product - The product associated with the subscription
   * @param payload - The Payload instance
   * @returns An array of permission slugs
   */
  resolveSubscriptionPermissions: ResolveSubscriptionPermissions<TProduct>

  /**
   * Resolves the permissions required by content.
   * This callback allows you to define how permissions are extracted from content items.
   * @param content - The content item to check permissions for
   * @param payload - The Payload instance
   * @returns An array of permission slugs required by the content
   */
  resolveContentPermissions: ResolveContentPermissions<TContent>
}

/**
 * Type alias for subscription permissions resolver callback
 * @template TProduct - The product type used by the consumer (defaults to unknown for flexibility)
 */
export type ResolveSubscriptionPermissions<TProduct = unknown> = (
  subscription: Stripe.Subscription,
  product: TProduct,
  payload: Payload
) => Promise<string[]>

/**
 * Type alias for content permissions resolver callback
 * @template TContent - The content type used by the consumer (defaults to unknown for flexibility)
 */
export type ResolveContentPermissions<TContent = unknown> = (content: TContent, payload: Payload) => Promise<string[]>

/**
 * Internal configuration passed to endpoint handlers
 */
export interface StripeEndpointConfig {
  routes: StripeInventoryRoutes
  checkPermissions?: (request: PayloadRequest) => Promise<boolean>
  resolveUser?: (request: PayloadRequest) => Promise<BaseUser | null>
}
