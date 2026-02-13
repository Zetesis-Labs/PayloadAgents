'use server'

import type { CollectionSlug, Payload, Where } from 'payload'

interface UpsertOptions {
  collection: CollectionSlug
  payload: Payload
  data: Record<string, unknown>
  where: Where
}

export const payloadUpsert = async <T extends Record<string, unknown> = Record<string, unknown>>({
  payload,
  collection,
  data,
  where
}: UpsertOptions): Promise<T | null> => {
  try {
    const existingDocs = await payload.find({
      collection,
      where,
      pagination: false,
      limit: 1
    })

    const existingDocId = existingDocs.docs?.at(0)?.id
    if (existingDocId) {
      const updatedDoc = await payload.update({
        collection,
        id: existingDocId,
        data
      })

      return (updatedDoc as unknown as T) || null
    }

    const created = await payload.create({
      collection,
      data
    })

    return created as unknown as T
  } catch (error) {
    console.error(`Error in payloadUpsert: ${error}`)
    throw new Error(`Failed to upsert document in collection ${collection} ${error}`)
  }
}
