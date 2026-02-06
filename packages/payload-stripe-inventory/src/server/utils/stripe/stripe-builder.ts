import Stripe from 'stripe'

let stripeInstance: Stripe | null = null

export const stripeBuilder = (): Stripe => {
  if (stripeInstance) {
    return stripeInstance
  }

  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY environment variable is not set')
  }

  stripeInstance = new Stripe(secretKey, {
    apiVersion: '2024-09-30.acacia'
  })

  return stripeInstance
}
