import type { Endpoint } from 'payload'
import { APIError } from 'payload'

interface KeycloakOrganization {
  id: string
  name: string
  alias: string
  enabled: boolean
  description?: string
  attributes?: Record<string, string[]>
}

interface KeycloakTokenResponse {
  access_token: string
  expires_in: number
  token_type: string
}

async function getKeycloakAdminToken(): Promise<string> {
  const keycloakUrl = process.env.NEXT_CONTAINER_KEYCLOAK_ENDPOINT
  const adminUser = process.env.KEYCLOAK_ADMIN_USER
  const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD

  console.log('[Keycloak] Getting admin token...')
  console.log('[Keycloak] URL:', keycloakUrl)
  console.log('[Keycloak] User:', adminUser)

  if (!keycloakUrl || !adminUser || !adminPassword) {
    throw new APIError(
      'Keycloak admin configuration is missing. Please set KEYCLOAK_ADMIN_USER and KEYCLOAK_ADMIN_PASSWORD.',
      500,
      null,
      true
    )
  }

  // Obtener token del realm master con grant_type=password
  const tokenUrl = `${keycloakUrl}/realms/master/protocol/openid-connect/token`
  console.log('[Keycloak] Token URL:', tokenUrl)

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: adminUser,
      password: adminPassword
    })
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('[Keycloak] Token error:', error)
    throw new APIError(`Failed to get Keycloak admin token: ${error}`, 500, null, true)
  }

  const data: KeycloakTokenResponse = await response.json()
  console.log('[Keycloak] ✅ Got admin token')
  return data.access_token
}

async function getKeycloakOrganizations(accessToken: string): Promise<KeycloakOrganization[]> {
  const keycloakUrl = process.env.NEXT_CONTAINER_KEYCLOAK_ENDPOINT
  const realm = process.env.NEXT_PUBLIC_KC_REALM

  // Endpoint de organizaciones de Keycloak
  const orgsUrl = `${keycloakUrl}/admin/realms/${realm}/organizations`

  console.log('[Keycloak] Fetching organizations from:', orgsUrl)
  console.log('[Keycloak] Realm:', realm)

  const response = await fetch(orgsUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  })

  console.log('[Keycloak] Response status:', response.status)

  if (!response.ok) {
    const error = await response.text()
    console.error('[Keycloak] Error response:', error)
    throw new APIError(
      `Failed to get Keycloak organizations (${response.status}): ${error}. URL: ${orgsUrl}`,
      500,
      null,
      true
    )
  }

  const orgs = await response.json()
  console.log('[Keycloak] Found organizations:', orgs.length)
  return orgs
}

// Endpoint to sync tenants from Keycloak organizations
// POST /api/tenants/sync-from-keycloak
export const syncFromKeycloak: Endpoint = {
  handler: async req => {
    // Check if user is super admin

    try {
      // Get admin token
      const accessToken = await getKeycloakAdminToken()

      // Get organizations from Keycloak
      const organizations = await getKeycloakOrganizations(accessToken)

      const results = {
        created: [] as string[],
        updated: [] as string[],
        skipped: [] as string[],
        errors: [] as string[]
      }

      for (const org of organizations) {
        console.log(`[Keycloak] Processing org: ${org.name} (${org.id}), alias: ${org.alias}`)

        try {
          // Check if tenant with this keycloakOrgId already exists
          const existingTenant = await req.payload.find({
            collection: 'tenants',
            where: {
              keycloakOrgId: {
                equals: org.id
              }
            },
            limit: 1
          })

          const tenant = existingTenant.docs[0]
          if (tenant) {
            console.log(`[Keycloak] Found existing tenant by keycloakOrgId: ${tenant.name}`)
            // Update existing tenant if name changed
            if (tenant.name !== org.name) {
              await req.payload.update({
                collection: 'tenants',
                id: tenant.id,
                data: {
                  name: org.name
                } as Record<string, unknown>
              })
              results.updated.push(org.name)
              console.log(`[Keycloak] ✅ Updated tenant: ${org.name}`)
            } else {
              results.skipped.push(org.name)
              console.log(`[Keycloak] ⏭️ Skipped tenant: ${org.name} (no changes)`)
            }
          } else {
            // Check if tenant with this slug already exists
            const existingBySlug = await req.payload.find({
              collection: 'tenants',
              where: {
                slug: {
                  equals: org.alias
                }
              },
              limit: 1
            })

            const tenantBySlug = existingBySlug.docs[0]
            if (tenantBySlug) {
              console.log(`[Keycloak] Found existing tenant by slug: ${tenantBySlug.name}`)
              // Update existing tenant with keycloakOrgId
              await req.payload.update({
                collection: 'tenants',
                id: tenantBySlug.id,
                data: {
                  keycloakOrgId: org.id,
                  name: org.name
                } as Record<string, unknown>
              })
              results.updated.push(org.name)
              console.log(`[Keycloak] ✅ Updated tenant with keycloakOrgId: ${org.name}`)
            } else {
              console.log(`[Keycloak] Creating new tenant: ${org.name}, slug: ${org.alias}`)
              // Create new tenant
              await req.payload.create({
                collection: 'tenants',
                data: {
                  name: org.name,
                  slug: org.alias,
                  keycloakOrgId: org.id,
                  allowPublicRead: false
                }
              })
              results.created.push(org.name)
              console.log(`[Keycloak] ✅ Created tenant: ${org.name}`)
            }
          }
        } catch (error) {
          console.error(`[Keycloak] ❌ Error processing ${org.name}:`, error)
          results.errors.push(`${org.name}: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }

      return Response.json({
        success: true,
        message: 'Sync completed',
        totalOrganizations: organizations.length,
        results
      })
    } catch (error) {
      if (error instanceof APIError) {
        throw error
      }
      throw new APIError(
        `Failed to sync from Keycloak: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500,
        null,
        true
      )
    }
  },
  method: 'post',
  path: '/sync-from-keycloak'
}
