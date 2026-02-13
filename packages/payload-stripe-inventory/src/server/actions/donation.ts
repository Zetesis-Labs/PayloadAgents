import type { Payload } from 'payload'
import type Stripe from 'stripe'
import { recordPaymentEvent } from './record-payment-event'

export const paymentSucceeded = async (paymentIntent: Stripe.PaymentIntent, payload: Payload) => {
  await recordPaymentEvent(paymentIntent, payload, 'payments')
}
