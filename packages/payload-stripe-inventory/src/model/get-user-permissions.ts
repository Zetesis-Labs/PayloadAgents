import type { BaseUser, Customer } from '../types'

/**
 * Obtiene los permisos de un usuario basados en su inventario y suscripciones activas
 */
export const getUserPermissions = (user?: BaseUser | null): string[] => {
  if (!user) return []

  const customer = user?.customer as Customer
  const inventory = customer?.inventory
  if (!inventory) return []

  const subscriptionPermissions = Object.values(inventory.subscriptions)
    ?.filter(subscription => subscription.status === 'active' || subscription.status === 'trialing')
    ?.flatMap(subscription => subscription.permissions)

  return subscriptionPermissions
}
