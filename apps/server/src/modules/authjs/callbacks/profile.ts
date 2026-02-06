/**
 * Profile callback - Transforma el perfil de Keycloak al formato de Payload
 * También sincroniza tenants basándose en las organizaciones del usuario
 */

import type { Profile } from 'next-auth'
import { getPayload } from '../../get-payload'
import { hasOrgAdminRole, mapKeycloakRoles } from '../utils/map-keycloak-roles'
import { parseKeycloakOrganizations } from '../utils/parse-organizations'
import { syncUserTenants } from '../utils/sync-user-tenants'

interface KeycloakProfile extends Profile {
  sub: string
  name?: string
  email?: string
  picture?: string
  roles?: string[]
  realm_access?: {
    roles?: string[]
  }
  organizations_info?: unknown
}

interface PayloadUser {
  id: string
  name: string | null
  email: string | null
  image: string | null
  roles: string[]
}

export async function profileCallback(profile: KeycloakProfile): Promise<PayloadUser> {
  const roles = mapKeycloakRoles(profile)

  // Sincronizar tenants después de que el usuario exista
  // Esto se ejecuta en cada login
  if (profile.organizations_info && typeof window === 'undefined') {
    const keycloakOrgIds = parseKeycloakOrganizations(profile.organizations_info)

    if (keycloakOrgIds.length > 0) {
      // Programar la sincronización para después (el usuario puede no existir aún)
      setTimeout(async () => {
        try {
          const payload = await getPayload()

          // Buscar usuario por email
          const users = await payload.find({
            collection: 'users',
            where: {
              email: {
                equals: profile.email
              }
            },
            limit: 1
          })

          const user = users.docs[0]
          if (user) {
            // Verificar si tiene org_admin para asignar tenant-admin
            const isOrgAdmin = hasOrgAdminRole(profile)

            const result = await syncUserTenants(payload, String(user.id), keycloakOrgIds, { isOrgAdmin })

            if (result.assigned > 0) {
              const role = isOrgAdmin ? 'tenant-admin' : 'tenant-viewer'
              console.log(`[Auth] ✅ Assigned user ${profile.email} to ${result.assigned} tenants as ${role}`)
            }
          }
        } catch (error) {
          console.error('[Auth] Error syncing tenants:', error)
        }
      }, 1000) // Esperar 1 segundo para asegurar que el usuario exista
    }
  }

  return {
    id: profile.sub,
    name: profile.name ?? null,
    email: profile.email ?? null,
    image: profile.picture ?? null,
    roles
  }
}
