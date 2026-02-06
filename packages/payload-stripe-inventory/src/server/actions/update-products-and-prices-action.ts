'use server'

import type { Payload } from 'payload'
import { updatePrices } from './price'
import { updateProducts } from './product'

export async function updateProductsAndPrices(payload: Payload) {
  await updateProducts(payload)
  await updatePrices(payload)
}
