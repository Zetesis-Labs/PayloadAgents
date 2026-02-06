import type Stripe from 'stripe'

export interface Customer {
  stripeId: string
  email: string
  inventory: CustomerInventory
}

export interface CustomerInventory {
  subscriptions: { [key: string]: Stripe.Subscription & { permissions: string[] } }
  products: { [key: string]: Stripe.Product & { permissions: string[] } }
  payments: { [key: string]: Stripe.PaymentIntent }
  invoices: { [key: string]: Stripe.Invoice }
}
