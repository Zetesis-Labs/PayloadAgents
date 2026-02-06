/**
 * Mapea roles de Keycloak a roles de Payload CMS
 * Payload solo acepta: 'superadmin' o 'user'
 *
 * - superadmin en Keycloak → superadmin en Payload
 */

type PayloadRole = 'superadmin' | 'user'

interface KeycloakProfile {
  roles?: string[]
  realm_access?: {
    roles?: string[]
  }
}

export function mapKeycloakRoles(profile: KeycloakProfile): PayloadRole[] {
  const keycloakRoles = [...(profile.roles ?? []), ...(profile.realm_access?.roles ?? [])]

  const hasSuperAdmin = keycloakRoles.includes('superadmin')

  if (hasSuperAdmin) {
    return ['superadmin']
  }

  return ['user']
}

/**
 * Verifica si el usuario tiene rol org_admin en Keycloak
 * Se usa para asignar tenant-admin en los tenants
 */
export function hasOrgAdminRole(profile: KeycloakProfile): boolean {
  const keycloakRoles = [...(profile.roles ?? []), ...(profile.realm_access?.roles ?? [])]

  return keycloakRoles.includes('org_admin')
}
