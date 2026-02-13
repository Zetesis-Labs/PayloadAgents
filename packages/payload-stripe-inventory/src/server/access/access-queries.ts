import type { Access } from 'payload'

/**
 * Creates access control functions parameterized by the admin permission slug.
 * This allows the consumer to define their own admin role name.
 *
 * @example
 * ```typescript
 * const access = createAccessQueries('admin')
 * // Use in collection config:
 * { access: { read: access.isAdminOrPublished } }
 * ```
 */
export function createAccessQueries(adminPermissionSlug: string) {
  const isAdmin: Access = ({ req }) => {
    return req?.user?.roles?.includes(adminPermissionSlug) || false
  }

  const isAdminOrCurrentUser: Access = ({ req }) => {
    if (req?.user?.roles?.includes(adminPermissionSlug)) return true
    return { id: { equals: req.user?.id } }
  }

  const isAdminOrPublished: Access = ({ req: { user } }) => {
    if (user?.roles?.includes(adminPermissionSlug)) {
      return true
    }
    return { _status: { equals: 'published' } }
  }

  const isAdminOrStripeActive: Access = ({ req: { user } }) => {
    if (user?.roles?.includes(adminPermissionSlug)) {
      return true
    }
    return { active: { equals: true } }
  }

  const isAdminOrUserFieldMatchingCurrentUser: Access = ({ req: { user } }) => {
    if (user) {
      if (user?.roles?.includes(adminPermissionSlug)) return true
      return { user: { equals: user?.id } }
    }
    return false
  }

  return {
    isAdmin,
    isAdminOrCurrentUser,
    isAdminOrPublished,
    isAdminOrStripeActive,
    isAdminOrUserFieldMatchingCurrentUser
  }
}

export const isAnyone: Access = () => true

export const loggedInOrPublished: Access = ({ req: { user } }) => {
  if (user) {
    return true
  }
  return { _status: { equals: 'published' } }
}
