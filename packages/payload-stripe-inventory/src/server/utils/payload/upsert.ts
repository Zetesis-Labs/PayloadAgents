'use server'

import type { Payload } from 'payload'

type Config = {
  collections: {
    [key: string]: any
  }
}

interface UpsertOptions<T extends keyof Config['collections']> {
  collection: T
  payload: Payload
  data: Omit<Config['collections'][T], 'createdAt' | 'id' | 'updatedAt' | 'sizes'>
  where: any
}

export const payloadUpsert = async <T extends keyof Config['collections']>({
  payload,
  collection,
  data,
  where
}: UpsertOptions<T>): Promise<Config['collections'][T] | null> => {
  try {
    const existingDocs = await payload.find({
      collection: collection as any,
      where,
      pagination: false,
      limit: 1
    })

    const existingDocId = existingDocs.docs?.at(0)?.id
    if (existingDocId) {
      const updatedDoc = await payload.update({
        collection: collection as any,
        id: existingDocId,
        data: data as any
      })

      return updatedDoc || null
    }

    return await payload.create({
      collection,
      data
    } as any)
  } catch (error) {
    console.error(`Error in payloadUpsert: ${error}`)
    throw new Error(`Failed to upsert document in collection ${collection} ${error}`)
  }
}
