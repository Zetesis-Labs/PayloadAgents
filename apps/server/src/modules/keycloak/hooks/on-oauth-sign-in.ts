/**
 * Post-OAuth sign-in hook for Keycloak
 * Replicates the logic from the old authjs callbacks:
 * - Maps Keycloak roles to Payload roles
 * - Saves id_token for Keycloak logout
 * - Syncs user tenants from Keycloak organizations
 */

import { hasOrgAdminRole, mapKeycloakRoles } from '../utils/map-keycloak-roles'
import { parseKeycloakOrganizations } from '../utils/parse-organizations'
import { syncUserTenants } from '../utils/sync-user-tenants'

interface PendingOAuthData {
  idToken: string
  profile: Record<string, unknown>
}

// Temporary store for OAuth data between getUserInfo and the after-callback hook.
// Entries are created in getUserInfo and consumed immediately in the after hook
// within the same request cycle.
const pendingOAuthData = new Map<string, PendingOAuthData>()

export function setPendingOAuthData(email: string, idToken: string, profile: Record<string, unknown>) {
  pendingOAuthData.set(email, { idToken, profile })
}

export async function processOAuthSignIn(userId: string, email: string) {
  const data = pendingOAuthData.get(email)
  if (!data) {
    console.log('[Auth] No pending OAuth data for:', email)
    return
  }

  pendingOAuthData.delete(email)

  try {
    // Debug: Log profile to see where roles are
    console.log('[Auth] Processing OAuth for user:', email)
    console.log('[Auth] Keycloak profile keys:', Object.keys(data.profile))
    console.log('[Auth] Profile roles:', data.profile.roles)
    console.log('[Auth] Profile realm_access:', data.profile.realm_access)

    // Dynamic import to avoid circular dependency with payload.config.ts
    const { getPayload } = await import('@/modules/get-payload')
    const payload = await getPayload()

    // Note: idToken is automatically saved to accounts collection by better-auth

    // 1. Map Keycloak roles to Payload roles and update user
    // 'role' is the field used by payload-auth for admin panel access
    const mappedRoles = mapKeycloakRoles(data.profile as { roles?: string[]; realm_access?: { roles?: string[] } })
    console.log('[Auth] Mapped roles:', mappedRoles)
    await payload.update({
      collection: 'users',
      id: userId,
      data: { role: mappedRoles }
    })
    console.log('[Auth] ✅ Role updated for user:', email, '- role:', mappedRoles)

    // 3. Sync tenants from Keycloak organizations
    if (data.profile.organizations_info) {
      const keycloakOrgIds = parseKeycloakOrganizations(data.profile.organizations_info)
      if (keycloakOrgIds.length > 0) {
        const isOrgAdmin = hasOrgAdminRole(data.profile as { roles?: string[]; realm_access?: { roles?: string[] } })
        const result = await syncUserTenants(payload, userId, keycloakOrgIds, { isOrgAdmin })
        if (result.assigned > 0) {
          const role = isOrgAdmin ? 'tenant-admin' : 'tenant-viewer'
          console.log(`[Auth] Assigned user ${email} to ${result.assigned} tenants as ${role}`)
        }
      }
    }
  } catch (error) {
    console.error('[Auth] Error processing OAuth sign-in:', error)
  }
}
