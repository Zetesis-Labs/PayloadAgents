import type { Access } from 'payload'
import { isSuperAdmin } from '../../../access/isSuperAdmin'
import type { Tenant, User } from '../../../payload-types'
import { getUserTenantIDs } from '../../../utilities/getUserTenantIDs'

export const createAccess: Access<User> = ({ req }) => {
  if (!req.user) {
    return false
  }

  if (isSuperAdmin(req.user)) {
    return true
  }

  if (!isSuperAdmin(req.user) && req.data?.roles?.includes('superadmin')) {
    return false
  }

  const adminTenantAccessIDs = getUserTenantIDs(req.user, 'tenant-admin')

  const requestedTenants: Tenant['id'][] = req.data?.tenants?.map((t: { tenant: Tenant['id'] }) => t.tenant) ?? []

  const hasAccessToAllRequestedTenants = requestedTenants.every(tenantID => adminTenantAccessIDs.includes(tenantID))

  if (hasAccessToAllRequestedTenants) {
    return true
  }

  return false
}
