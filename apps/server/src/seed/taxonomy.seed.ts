import type { Payload } from 'payload'
import type { Taxonomy } from '@/payload-types'

/**
 * Resolve a taxonomy given as a numeric ID by verifying it exists
 */
async function resolveNumericTaxonomy(payload: Payload, id: number): Promise<Taxonomy> {
  try {
    const existing = await payload.findByID({
      collection: 'taxonomy',
      id
    })
    payload.logger.debug(`Taxonomy ${id} exists`)
    return existing
  } catch (_error) {
    throw new Error(
      `Taxonomy con ID ${id} no existe. Se necesita el objeto completo de la taxonomía para crearla automáticamente.`
    )
  }
}

/**
 * Build search fields for finding an existing taxonomy by slug or name
 */
function buildTaxonomySearchFields(taxonomyData: Taxonomy): Record<string, { equals: string }>[] {
  const searchFields: Record<string, { equals: string }>[] = []

  if (taxonomyData.slug) {
    searchFields.push({ slug: { equals: taxonomyData.slug } })
  }

  if (taxonomyData.name) {
    searchFields.push({ name: { equals: taxonomyData.name } })
  }

  return searchFields
}

/**
 * Find an existing taxonomy by slug or name
 */
async function findExistingTaxonomy(
  payload: Payload,
  searchFields: Record<string, { equals: string }>[]
): Promise<Taxonomy | null> {
  if (searchFields.length === 0) {
    return null
  }

  const existingTaxonomies = await payload.find({
    collection: 'taxonomy',
    where: {
      or: searchFields
    },
    limit: 1
  })
  return existingTaxonomies.docs[0] ?? null
}

/**
 * Resolve the parent taxonomy ID, creating it recursively if needed
 */
async function resolveParentId(
  payload: Payload,
  mode: 'create' | 'upsert',
  parent: Taxonomy['parent']
): Promise<number | undefined> {
  if (!parent) {
    return undefined
  }

  if (typeof parent === 'number') {
    try {
      await payload.findByID({ collection: 'taxonomy', id: parent })
      return parent
    } catch (_error) {
      throw new Error(
        `Parent taxonomy con ID ${parent} no existe. Se necesita el objeto completo de la taxonomía padre para crearla automáticamente.`
      )
    }
  }

  // Recursively create parent taxonomy first
  const parentSeeder = seedTaxonomy(payload, mode)
  const createdParent = await parentSeeder(parent)
  return createdParent.id
}

/**
 * Build the data payload for creating or updating a taxonomy
 */
function buildTaxonomyPayload(taxonomyData: Taxonomy, parentId: number | undefined) {
  return {
    name: taxonomyData.name,
    slug: taxonomyData.slug,
    parent: parentId,
    ...(taxonomyData.generateSlug !== undefined ? { generateSlug: taxonomyData.generateSlug } : {}),
    ...(taxonomyData.payload ? { payload: taxonomyData.payload } : {})
  }
}

/**
 * Create or update a taxonomy in the database
 */
async function upsertTaxonomy(
  payload: Payload,
  taxonomyData: Taxonomy,
  existingTaxonomy: Taxonomy | null,
  taxonomyPayload: ReturnType<typeof buildTaxonomyPayload>
): Promise<Taxonomy> {
  if (existingTaxonomy) {
    const updated = await payload.update({
      collection: 'taxonomy',
      id: existingTaxonomy.id,
      data: taxonomyPayload
    })
    payload.logger.debug(`Taxonomy ${taxonomyData.name} actualizado`)
    return updated
  }

  // Create new taxonomy
  // NOTE: We DON'T preserve the ID from the source data because:
  // - IDs from different datasets may have cross-references
  // - Let PayloadCMS assign fresh IDs to avoid foreign key conflicts
  const created = await payload.create({
    collection: 'taxonomy',
    data: taxonomyPayload
  })
  payload.logger.debug(`Nueva taxonomy creada con ID: ${created.id} (original ID was ${taxonomyData.id})`)
  return created
}

/**
 * Log detailed error information for seed failures
 */
function logSeedError(logger: Payload['logger'], error: unknown, identifier: string | number): void {
  logger.error(`Error al procesar taxonomy ${identifier}:`)
  logger.error(String(error))

  if (error instanceof Error) {
    logger.error(`Error message: ${error.message}`)
  }
  if (typeof error === 'object' && error !== null && 'data' in error) {
    logger.error(`Error data: ${JSON.stringify((error as Record<string, unknown>).data)}`)
  }
}

export const seedTaxonomy =
  (payload: Payload, mode: 'create' | 'upsert') =>
  async (taxonomyData?: Taxonomy | number | null): Promise<Taxonomy> => {
    const logger = payload.logger

    // Handle null/undefined case
    if (!taxonomyData) {
      throw new Error('Taxonomy data is required')
    }

    // Handle number case - only verify it exists
    if (typeof taxonomyData === 'number') {
      return resolveNumericTaxonomy(payload, taxonomyData)
    }

    // Handle object case
    logger.debug(`Processing taxonomy ${taxonomyData.id} with name ${taxonomyData.name}`)

    try {
      const searchFields = buildTaxonomySearchFields(taxonomyData)
      const existingTaxonomy = await findExistingTaxonomy(payload, searchFields)

      // If exists and mode is 'create', skip
      if (existingTaxonomy && mode === 'create') {
        logger.debug(`Taxonomy ${taxonomyData.name} ya existe y modo es 'create', saltando...`)
        return existingTaxonomy
      }

      // Ensure parent taxonomy exists first (recursive)
      const parentId = await resolveParentId(payload, mode, taxonomyData.parent)

      // Prepare the data to insert/update
      const taxonomyPayload = buildTaxonomyPayload(taxonomyData, parentId)

      return await upsertTaxonomy(payload, taxonomyData, existingTaxonomy, taxonomyPayload)
    } catch (error: unknown) {
      const taxonomyId =
        typeof taxonomyData === 'number' ? taxonomyData : taxonomyData.id || taxonomyData.name || 'unknown'
      logSeedError(logger, error, taxonomyId)
      throw error
    }
  }
