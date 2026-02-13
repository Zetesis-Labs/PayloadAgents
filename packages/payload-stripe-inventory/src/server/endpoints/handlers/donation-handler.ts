import type { PayloadHandler, PayloadRequest } from 'payload'
import type Stripe from 'stripe'
import type { StripeEndpointConfig } from '../../plugin/stripe-inventory-types'
import { errorResponse, jsonResponse, validateAuthenticatedRequest } from '../validators/request-validator'
import { ensureStripeCustomer } from './ensure-stripe-customer'

/**
 * Creates a handler for one-time donation payments
 *
 * @param config - Endpoint configuration
 * @returns PayloadHandler for donation endpoint
 */
export function createDonationHandler(config: StripeEndpointConfig): PayloadHandler {
  return async (request: PayloadRequest): Promise<Response> => {
    try {
      const validated = await validateAuthenticatedRequest(request, config)
      if (!validated.success) {
        return validated.error
      }

      const { user, payload } = validated

      if (!user.email) {
        return errorResponse('User email is required', 400)
      }

      // Extract amount from query params
      const url = new URL(request.url || '')
      const amountParam = url.searchParams.get('amount')

      if (!amountParam) {
        return errorResponse('amount is required', 400)
      }

      const amount = parseInt(amountParam, 10)
      const currency = config.donationConfig?.currency ?? 'eur'
      const minimumAmount = config.donationConfig?.minimumAmount ?? 100

      if (Number.isNaN(amount) || amount < minimumAmount) {
        return errorResponse(`Minimum donation amount is ${minimumAmount} cents`, 400)
      }

      const { stripe, customerId } = await ensureStripeCustomer(user, user.email, payload, config)

      // Determine redirect URLs
      const donationPageHref = config.routes.donationPageHref || config.routes.subscriptionPageHref

      // Prepare metadata
      const metadata: Stripe.MetadataParam = {
        type: 'donation'
      }

      // Create checkout session for one-time payment
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency,
              product_data: {
                name: 'Donation',
                description: 'One-time donation'
              },
              unit_amount: amount
            },
            quantity: 1
          }
        ],
        mode: 'payment',
        success_url: `${config.domain}${donationPageHref}?success=donation`,
        cancel_url: `${config.domain}${donationPageHref}?error=donation_cancelled`,
        metadata,
        payment_intent_data: { metadata },
        invoice_creation: { enabled: true, invoice_data: { metadata } }
      })

      return jsonResponse({ url: session.url })
    } catch (error) {
      request.payload.logger.error({ err: error, msg: '[Stripe Donation Error]' })
      return errorResponse(error instanceof Error ? error.message : 'Unknown error occurred', 500)
    }
  }
}
