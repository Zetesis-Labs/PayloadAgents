import type { Payload } from 'payload'
import type { Tenant } from '@/payload-types'

/**
 * Resolve a tenant given as a numeric ID by verifying it exists
 */
async function resolveNumericTenant(payload: Payload, id: number): Promise<Tenant> {
  try {
    const existing = await payload.findByID({
      collection: 'tenants',
      id
    })
    payload.logger.debug(`Tenant ${id} exists`)
    return existing
  } catch (_error) {
    throw new Error(
      `Tenant con ID ${id} no existe. Se necesita el objeto completo del tenant para crearlo automáticamente.`
    )
  }
}

/**
 * Build search fields for finding an existing tenant by keycloakOrgId or slug
 */
function buildTenantSearchFields(tenantData: Tenant): Record<string, { equals: string }>[] {
  const searchFields: Record<string, { equals: string }>[] = []

  if (tenantData.keycloakOrgId) {
    searchFields.push({ keycloakOrgId: { equals: tenantData.keycloakOrgId } })
  }

  if (tenantData.slug) {
    searchFields.push({ slug: { equals: tenantData.slug } })
  }

  return searchFields
}

/**
 * Find an existing tenant by keycloakOrgId or slug
 */
async function findExistingTenant(
  payload: Payload,
  searchFields: Record<string, { equals: string }>[]
): Promise<Tenant | null> {
  if (searchFields.length === 0) {
    return null
  }

  const existingTenants = await payload.find({
    collection: 'tenants',
    where: {
      or: searchFields
    },
    limit: 1
  })
  return existingTenants.docs[0] ?? null
}

/**
 * Build the data payload for creating or updating a tenant
 */
function buildTenantPayload(tenantData: Tenant) {
  return {
    name: tenantData.name,
    domain: tenantData.domain,
    slug: tenantData.slug,
    allowPublicRead: tenantData.allowPublicRead ?? false,
    keycloakOrgId: tenantData.keycloakOrgId
  }
}

/**
 * Create or update a tenant in the database
 */
async function upsertTenant(
  payload: Payload,
  tenantData: Tenant,
  existingTenant: Tenant | null,
  tenantPayload: ReturnType<typeof buildTenantPayload>
): Promise<Tenant> {
  if (existingTenant) {
    const updated = await payload.update({
      collection: 'tenants',
      id: existingTenant.id,
      data: tenantPayload
    })
    payload.logger.debug(`Tenant ${tenantData.slug} actualizado`)
    return updated
  }

  // Create new tenant
  const createData = { ...tenantPayload, ...(tenantData.id ? { id: tenantData.id } : {}) }

  const created = await payload.create({
    collection: 'tenants',
    data: createData
  })
  payload.logger.debug(`Nuevo tenant creado con ID: ${created.id}`)
  return created
}

/**
 * Log detailed error information for seed failures
 */
function logSeedError(logger: Payload['logger'], error: unknown, identifier: string | number): void {
  logger.error(`Error al procesar tenant ${identifier}:`)
  logger.error(String(error))

  if (error instanceof Error) {
    logger.error(`Error message: ${error.message}`)
  }
  if (typeof error === 'object' && error !== null && 'data' in error) {
    logger.error(`Error data: ${JSON.stringify((error as Record<string, unknown>).data)}`)
  }
}

export const seedTenant =
  (payload: Payload, mode: 'create' | 'upsert') =>
  async (tenantData?: Tenant | null | number): Promise<Tenant> => {
    const logger = payload.logger

    // Handle null/undefined case
    if (!tenantData) {
      throw new Error('Tenant data is required')
    }

    // Handle number case - only verify it exists
    if (typeof tenantData === 'number') {
      return resolveNumericTenant(payload, tenantData)
    }

    // Handle object case
    logger.debug(`Processing tenant ${tenantData.id} with slug ${tenantData.slug}`)

    try {
      const searchFields = buildTenantSearchFields(tenantData)
      const existingTenant = await findExistingTenant(payload, searchFields)

      // If exists and mode is 'create', skip
      if (existingTenant && mode === 'create') {
        logger.debug(`Tenant ${tenantData.slug} ya existe y modo es 'create', saltando...`)
        return existingTenant
      }

      // Prepare the data to insert/update
      const tenantPayload = buildTenantPayload(tenantData)

      return await upsertTenant(payload, tenantData, existingTenant, tenantPayload)
    } catch (error: unknown) {
      const tenantId =
        typeof tenantData === 'number'
          ? tenantData
          : tenantData.id || tenantData.keycloakOrgId || tenantData.slug || 'unknown'
      logSeedError(logger, error, tenantId)
      throw error
    }
  }
