import type { BaseUser, UnlockItem, UserInventory } from '../types'

export const isContentUnlocked = (user: BaseUser<UserInventory>, contentId: number, collection: string): boolean => {
  if (!user?.inventory?.unlocks) return false

  return user.inventory.unlocks.some(
    (unlock: UnlockItem) => unlock.id === contentId && unlock.collection === collection
  )
}
