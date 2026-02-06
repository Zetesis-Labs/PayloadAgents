import { getTenantFromCookie } from '@payloadcms/plugin-multi-tenant/utilities'
import type { FieldHook, Where } from 'payload'
import { ValidationError } from 'payload'
import { getCollectionIDType } from '@/utilities/getCollectionIDType'
import { getUserTenantIDs } from '../../../utilities/getUserTenantIDs'

export const ensureUniqueUsername: FieldHook = async ({ originalDoc, req, value }) => {
  // if value is unchanged, skip validation
  if (originalDoc.username === value) {
    return value
  }

  const constraints: Where[] = [
    {
      username: {
        equals: value
      }
    }
  ]

  const selectedTenant = getTenantFromCookie(
    req.headers,
    getCollectionIDType({ payload: req.payload, collectionSlug: 'tenants' })
  )

  if (selectedTenant) {
    constraints.push({
      'tenants.tenant': {
        equals: selectedTenant
      }
    })
  }

  const findDuplicateUsers = await req.payload.find({
    collection: 'users',
    where: {
      and: constraints
    }
  })
  if (req.user?.collection === 'payload-mcp-api-keys') {
    return
  }

  if (findDuplicateUsers.docs.length > 0 && req.user) {
    const tenantIDs = getUserTenantIDs(req.user)
    if (selectedTenant && (req.user.roles?.includes('superadmin') || tenantIDs.length > 1)) {
      const attemptedTenantChange = await req.payload.findByID({
        id: selectedTenant,
        collection: 'tenants'
      })

      throw new ValidationError({
        errors: [
          {
            message: `The "${attemptedTenantChange.name}" tenant already has a user with the username "${value}". Usernames must be unique per tenant.`,
            path: 'username'
          }
        ]
      })
    }

    throw new ValidationError({
      errors: [
        {
          message: `A user with the username ${value} already exists. Usernames must be unique per tenant.`,
          path: 'username'
        }
      ]
    })
  }

  return value
}
