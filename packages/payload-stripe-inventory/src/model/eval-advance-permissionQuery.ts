import type { BaseUser } from '../types'
import { QUERY_PERMISSION_TYPES } from './constants'
import { evalPermissionByRoleQuery } from './eval-permission-by-role-query'
import { getUserPermissions } from './get-user-permissions'

/**
 * Evalúa permisos avanzados basados en el tipo de permiso y usuario
 */
interface Props<T extends BaseUser> {
  user: T | null
  typeOfPermission: keyof typeof QUERY_PERMISSION_TYPES | string
  permissions?: string[] | undefined
}

export const evalAdvancePermissionQuery = <T extends BaseUser>({
  user,
  typeOfPermission,
  permissions
}: Props<T>): boolean => {
  if (typeOfPermission === QUERY_PERMISSION_TYPES.ALL) {
    return true
  } else if (typeOfPermission === QUERY_PERMISSION_TYPES.ROLES) {
    return evalPermissionByRoleQuery({
      user,
      permissions
    })
  } else if (typeOfPermission === QUERY_PERMISSION_TYPES.ONLY_NO_ROLES) {
    const userPermissions = getUserPermissions(user)
    return userPermissions.length === 0
  } else if (typeOfPermission === QUERY_PERMISSION_TYPES.ONLY_GUESS) {
    return user === null
  }

  return true
}
