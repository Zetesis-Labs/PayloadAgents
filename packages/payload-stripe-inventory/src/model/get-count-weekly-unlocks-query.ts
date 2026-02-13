import type { TypedUser } from 'payload'
import type { UserInventory } from '../types'

/**
 * Counts how many items the user has unlocked in the last 7 days
 */
export const countWeeklyUnlocksQuery = (user: TypedUser): number => {
  const inventory = user.inventory as UserInventory | undefined
  if (!inventory || !inventory.unlocks || inventory.unlocks.length === 0) {
    return 0
  }

  // Use UTC to ensure consistent counting regardless of server timezone
  const now = Date.now()
  const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000
  const sevenDaysAgo = now - sevenDaysInMs

  return inventory.unlocks.filter(unlock => new Date(unlock.dateUnlocked).getTime() >= sevenDaysAgo).length
}
