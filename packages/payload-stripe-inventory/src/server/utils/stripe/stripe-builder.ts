import Stripe from 'stripe'

const instances = new Map<string, Stripe>()

export const stripeBuilder = (secretKey?: string): Stripe => {
  const key = secretKey || process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY environment variable is not set')
  }

  const existing = instances.get(key)
  if (existing) {
    return existing
  }

  const instance = new Stripe(key, {
    apiVersion: '2024-09-30.acacia'
  })
  instances.set(key, instance)

  return instance
}
