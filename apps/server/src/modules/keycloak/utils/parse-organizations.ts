/**
 * Parsea organizations_info de Keycloak y extrae los IDs
 * Formato de entrada: {"org-alias": {"id": "uuid"}, ...}
 */

interface KeycloakOrgInfo {
  id: string
  [key: string]: unknown
}

type OrganizationsInfo = Record<string, KeycloakOrgInfo>

export function parseKeycloakOrganizations(organizationsInfo: unknown): string[] {
  if (!organizationsInfo) {
    return []
  }

  try {
    const orgsInfo: OrganizationsInfo =
      typeof organizationsInfo === 'string' ? JSON.parse(organizationsInfo) : (organizationsInfo as OrganizationsInfo)

    const orgIds: string[] = []

    for (const orgAlias in orgsInfo) {
      const orgId = orgsInfo[orgAlias]?.id
      if (orgId) {
        orgIds.push(orgId)
      }
    }

    return orgIds
  } catch (error) {
    console.error('[Auth] Error parsing organizations_info:', error)
    return []
  }
}
