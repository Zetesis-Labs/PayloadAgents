import type { TypedUser } from 'payload'
import type { UnlockItem } from '../types'

export const isContentUnlocked = (user: TypedUser, contentId: number, collection: string): boolean => {
  if (!user?.inventory?.unlocks) return false

  return user.inventory.unlocks.some(
    (unlock: UnlockItem) => unlock.id === contentId && unlock.collection === collection
  )
}
