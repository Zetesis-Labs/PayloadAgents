import type { TypedUser } from 'payload'
import { permissionSlugs } from './constants'
import { getUserPermissions } from './get-user-permissions'
import { isContentUnlocked } from './is-content-unlocked'

/**
 * Evalúa si un usuario tiene los permisos necesarios basados en las semillas de permisos
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
  if (permissions.includes(permissionSlugs.free)) return true
  const isUnlocked = user && content?.id ? isContentUnlocked(user, content.id, content.collection) : false
  if (isUnlocked) return true
  return permissions.some(permission => permission && userPermissions.includes(permission))
}
