/**
 * Sincroniza los tenants de un usuario basándose en sus organizaciones de Keycloak
 *
 * - Si tiene org_admin en Keycloak → tenant-admin
 * - Si no → tenant-viewer
 */

import type { BasePayload } from 'payload'

interface TenantAssignment {
  tenant: number
  roles: string[]
}

interface SyncResult {
  assigned: number
  skipped: number
}

interface SyncOptions {
  /** Si true, asigna tenant-admin en lugar de tenant-viewer */
  isOrgAdmin: boolean
}

export async function syncUserTenants(
  payload: BasePayload,
  userId: string,
  keycloakOrgIds: string[],
  options: SyncOptions = { isOrgAdmin: false }
): Promise<SyncResult> {
  if (keycloakOrgIds.length === 0) {
    return { assigned: 0, skipped: 0 }
  }

  // Rol a asignar según si es org_admin o no
  const tenantRole = options.isOrgAdmin ? 'tenant-admin' : 'tenant-viewer'

  // Buscar tenants que coincidan con las organizaciones del usuario
  const matchingTenants = await payload.find({
    collection: 'tenants',
    where: {
      keycloakOrgId: {
        in: keycloakOrgIds
      }
    },
    limit: 100
  })

  if (matchingTenants.docs.length === 0) {
    return { assigned: 0, skipped: 0 }
  }

  // Obtener el usuario actual con sus tenants
  const currentUser = await payload.findByID({
    collection: 'users',
    id: userId
  })

  const currentTenants = (currentUser?.tenants || []) as TenantAssignment[]
  const currentTenantIds = new Set(currentTenants.map(t => t.tenant))

  // Agregar nuevos tenants
  const newAssignments: TenantAssignment[] = []

  for (const tenant of matchingTenants.docs) {
    if (!currentTenantIds.has(tenant.id)) {
      newAssignments.push({
        tenant: tenant.id,
        roles: [tenantRole]
      })
    }
  }

  if (newAssignments.length > 0) {
    await payload.update({
      collection: 'users',
      id: userId,
      data: {
        tenants: [...currentTenants, ...newAssignments]
      } as Record<string, unknown>
    })
  }

  return {
    assigned: newAssignments.length,
    skipped: matchingTenants.docs.length - newAssignments.length
  }
}
