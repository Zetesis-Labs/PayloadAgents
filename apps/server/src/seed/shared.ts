import type { Payload } from 'payload'
import type { Taxonomy, Tenant } from '@/payload-types'
import { seedTaxonomy } from './taxonomy.seed'
import { seedTenant } from './tenant.seed'

/**
 * Ensures a tenant exists, creating it if full data is provided
 * @throws Error if only ID is provided and tenant doesn't exist
 */
export async function ensureTenantExists(
  payload: Payload,
  tenantData?: Tenant | number | null
): Promise<number | undefined> {
  if (!tenantData) return undefined

  if (typeof tenantData === 'number') {
    // Only ID provided - verify it exists
    try {
      await payload.findByID({
        collection: 'tenants',
        id: tenantData
      })
      return tenantData
    } catch (error) {
      throw new Error(
        `Tenant con ID ${tenantData} no existe. Se necesita el objeto completo del tenant para crearlo automáticamente.`
      )
    }
  }

  // Full object provided - seed it
  if (tenantData?.id) {
    const tenantSeeder = seedTenant(payload, 'upsert')
    const createdTenant = await tenantSeeder(tenantData)
    return createdTenant.id
  }

  return undefined
}

/**
 * Ensures taxonomies exist, creating them if full data is provided
 * @throws Error if only ID is provided and taxonomy doesn't exist
 */
export async function ensureTaxonomiesExist(
  payload: Payload,
  categories?: (Taxonomy | number)[] | null
): Promise<number[]> {
  if (!categories || !Array.isArray(categories)) {
    return []
  }

  const categoryIds: number[] = []
  const taxonomySeeder = seedTaxonomy(payload, 'upsert')

  for (const cat of categories) {
    if (typeof cat === 'number') {
      // Only ID provided - verify it exists
      try {
        await payload.findByID({
          collection: 'taxonomy',
          id: cat
        })
        categoryIds.push(cat)
      } catch (error) {
        throw new Error(
          `Taxonomy con ID ${cat} no existe. Se necesita el objeto completo de la taxonomía para crearla automáticamente.`
        )
      }
    } else if (cat?.id || cat?.name) {
      // Full object provided - seed it
      const createdTaxonomy = await taxonomySeeder(cat)
      categoryIds.push(createdTaxonomy.id)
    }
  }

  return categoryIds
}
