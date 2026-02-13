import type { TypedUser } from 'payload'
import type { UserInventory } from '../types'

export const getNextUnlockDateQuery = (user: TypedUser): Date => {
  const inventory = user.inventory as UserInventory | undefined
  if (!inventory || !inventory.unlocks || inventory.unlocks.length === 0) {
    return new Date()
  }

  const lastUnlock = inventory.unlocks.sort(
    (a, b) => new Date(a.dateUnlocked).getTime() - new Date(b.dateUnlocked).getTime()
  )[inventory.unlocks.length - 1]

  const lastUnlockDate = lastUnlock ? new Date(lastUnlock.dateUnlocked) : new Date()
  const nextUnlockDate = new Date(lastUnlockDate)
  nextUnlockDate.setDate(lastUnlockDate.getDate() + 7)

  return nextUnlockDate
}
