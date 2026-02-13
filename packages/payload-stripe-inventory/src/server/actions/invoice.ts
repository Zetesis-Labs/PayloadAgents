import type { Payload } from 'payload'
import type Stripe from 'stripe'
import { recordPaymentEvent } from './record-payment-event'

export const invoiceSucceeded = async (invoice: Stripe.Invoice, payload: Payload) => {
  await recordPaymentEvent(invoice, payload, 'invoices')
}
