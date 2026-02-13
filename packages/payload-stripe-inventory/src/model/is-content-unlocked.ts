import type { TypedUser } from 'payload'
import type { UnlockItem, UserInventory } from '../types'

export const isContentUnlocked = (user: TypedUser, contentId: number, collection: string): boolean => {
  const inventory = user?.inventory as UserInventory | null | undefined
  if (!inventory?.unlocks) return false

  return inventory.unlocks.some((unlock: UnlockItem) => unlock.id === contentId && unlock.collection === collection)
}
