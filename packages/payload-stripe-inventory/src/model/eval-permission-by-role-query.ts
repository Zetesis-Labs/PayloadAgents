import type { TypedUser } from 'payload'
import { getUserPermissions } from './get-user-permissions'
import { isContentUnlocked } from './is-content-unlocked'

/**
 * Evaluates whether a user has the required permissions based on subscription roles.
 * Returns true if:
 * - No permissions are required
 * - Content is unlocked in the user's inventory
 * - User has at least one of the required permissions
 */
interface Props {
  user: TypedUser | null | undefined
  permissions?: string[] | null
  content?: {
    collection: string
    id: number
  }
}

export const evalPermissionByRoleQuery = ({ user, permissions, content }: Props): boolean => {
  const userPermissions = getUserPermissions(user)

  if (!permissions || permissions.length === 0) return true
  const isUnlocked = user && content?.id ? isContentUnlocked(user, content.id, content.collection) : false
  if (isUnlocked) return true
  return permissions.some(permission => permission && userPermissions.includes(permission))
}
