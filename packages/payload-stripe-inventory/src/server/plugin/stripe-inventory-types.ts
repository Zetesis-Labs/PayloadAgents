import type { CollectionSlug, Payload, PayloadRequest, TypedUser } from 'payload'
import type Stripe from 'stripe'

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
   * The base domain for all Stripe redirect URLs (e.g. 'https://example.com')
   */
  domain: string

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
   * Configuration for one-time donation payments
   */
  donationConfig?: {
    /** Currency code for donations (default: 'eur') */
    currency?: string
    /** Minimum donation amount in cents (default: 100) */
    minimumAmount?: number
  }

  /**
   * Callback invoked when a subscription is created or deleted
   */
  onSubscriptionUpdate?: (type: 'create' | 'delete', userId: string) => Promise<void>

  /**
   * Callback invoked after a payment intent succeeds (via webhook)
   */
  onPaymentSucceeded?: (payment: Stripe.PaymentIntent, payload: Payload) => Promise<void>

  /**
   * Callback invoked after an invoice is paid (via webhook)
   */
  onInvoicePaid?: (invoice: Stripe.Invoice, payload: Payload) => Promise<void>

  /**
   * Optional permission check for all Stripe endpoints.
   * If not provided, only checks for authenticated user.
   */
  checkPermissions?: (request: PayloadRequest) => Promise<boolean>

  /**
   * Optional custom user resolver.
   * If not provided, uses request.user.
   */
  resolveUser?: (request: PayloadRequest) => Promise<TypedUser | null>

  /**
   * Resolves the permissions granted by a subscription.
   * This callback allows you to define how permissions are extracted from a product.
   */
  resolveSubscriptionPermissions: ResolveSubscriptionPermissions<TProduct>

  /**
   * Resolves the permissions required by content.
   * This callback allows you to define how permissions are extracted from content items.
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
  domain: string
  routes: StripeInventoryRoutes
  userSlug: CollectionSlug
  donationConfig?: {
    currency?: string
    minimumAmount?: number
  }
  checkPermissions?: (request: PayloadRequest) => Promise<boolean>
  resolveUser?: (request: PayloadRequest) => Promise<TypedUser | null>
}

/**
 * Configuration for the unlock action factory
 */
export interface UnlockActionConfig<TContent = unknown> {
  resolveContentPermissions: ResolveContentPermissions<TContent>
  userSlug: CollectionSlug
  /** Maximum unlocks allowed per week (default: 3) */
  maxUnlocksPerWeek?: number
  /**
   * Custom validation before unlocking content.
   * Replaces the default permission + weekly limit checks.
   * Return { allowed: false, reason: '...' } to deny the unlock.
   */
  validateUnlock?: (
    user: TypedUser,
    permissions: string[],
    payload: Payload
  ) => Promise<{ allowed: boolean; reason?: string }>
  /**
   * Callback invoked after a successful unlock.
   * Use for analytics, notifications, or other side effects.
   */
  onUnlockSuccess?: (user: TypedUser, collection: string, contentId: number, payload: Payload) => Promise<void>
}
