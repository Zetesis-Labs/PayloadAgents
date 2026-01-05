import { Tenant } from '@/payload-types'

/**
 * Transforms a Tenant to its slug for Typesense indexing
 * Allows filtering pages by tenant using facets
 */
export const transformTenant = (value: Tenant | number | null): string => {
    if (!value) return ''
    if (typeof value === 'number') return String(value)
    return value.slug || String(value.id)
}
