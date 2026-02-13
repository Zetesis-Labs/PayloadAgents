'use server'

import type { Payload } from 'payload'
import type Stripe from 'stripe'
import { COLLECTION_SLUG_PRODUCTS } from '../../model'
import { payloadUpsert } from '../utils/payload/upsert'
import { stripeBuilder } from '../utils/stripe/stripe-builder'

export const updateProducts = async (payload: Payload) => {
  const stripe = await stripeBuilder()
  const products = await stripe.products.list({ limit: 100, active: true })
  await Promise.all(products.data.map(product => productSync(product, payload)))
}

export const productSync = async (object: Stripe.Product, payload: Payload) => {
  const { id: stripeProductID, name, description, images } = object
  if (object.deleted !== undefined) return await productDeleted(object, payload)
  try {
    await payloadUpsert({
      payload,
      collection: COLLECTION_SLUG_PRODUCTS,
      data: {
        prices: [],
        stripeID: stripeProductID,
        active: true,
        metadata: object.metadata,
        type: object.type,
        name,
        description,
        images: images?.map(image => ({ url: image })) || []
      },
      where: {
        stripeID: { equals: stripeProductID }
      }
    })
  } catch (error) {
    payload.logger.error(`- Error upserting product: ${error}`)
    throw error
  }
}

export const productDeleted = async (object: Stripe.Product, payload: Payload) => {
  const { id: stripeProductID } = object

  try {
    const productQuery = await payload.find({
      collection: COLLECTION_SLUG_PRODUCTS,
      where: {
        stripeID: { equals: stripeProductID }
      }
    })

    const payloadProductID = productQuery.docs?.[0]?.id

    if (payloadProductID) {
      await payload.delete({
        collection: COLLECTION_SLUG_PRODUCTS,
        id: payloadProductID
      })

      payload.logger.info(`✅ Successfully deleted product with Stripe ID: ${stripeProductID}`)
    }
  } catch (error) {
    payload.logger.error(`- Error deleting product: ${error}`)
    throw error
  }
}
