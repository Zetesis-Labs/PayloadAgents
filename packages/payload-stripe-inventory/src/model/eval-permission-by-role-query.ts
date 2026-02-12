import type { BaseUser } from '../types'
import { UserInventory } from '../types/user-inventory.types'
import { permissionSlugs } from './constants'
import { getUserPermissions } from './get-user-permissions'
import { isContentUnlocked } from './is-content-unlocked'

/**
 * Evalúa si un usuario tiene los permisos necesarios basados en las semillas de permisos
 */
interface Props<T extends BaseUser> {
  user: T | null | undefined
  permissions?: string[] | null
  content?: {
    collection: string
    id: number
  }
}

export const evalPermissionByRoleQuery = <T extends BaseUser>({ user, permissions, content }: Props<T>): boolean => {
  const userPermissions = getUserPermissions(user)

  if (!permissions || permissions.length === 0) return true
  if (permissions.includes(permissionSlugs.free)) return true
  const isUnlocked = user && content?.id ? isContentUnlocked(user as BaseUser<UserInventory>, content.id, content.collection) : false
  if (isUnlocked) return true
  return permissions.some(permission => permission && userPermissions.includes(permission))
}
