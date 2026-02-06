import type { TypedUser } from 'payload'
import type { Tenant, User } from '../payload-types'
import { extractID } from './extractID'

/**
 * Returns array of all tenant IDs assigned to a user
 *
 * @param user - User object with tenants field
 * @param role - Optional role to filter by
 */
export const getUserTenantIDs = (
  user: TypedUser | null,
  role?: NonNullable<User['tenants']>[number]['roles'][number]
): Tenant['id'][] => {
  if (!user || user.collection === 'payload-mcp-api-keys') {
    return []
  }

  return (
    user?.tenants?.reduce<Tenant['id'][]>((acc, { roles, tenant }) => {
      if (role && !roles.includes(role)) {
        return acc
      }

      if (tenant) {
        acc.push(extractID(tenant))
      }

      return acc
    }, []) || []
  )
}
