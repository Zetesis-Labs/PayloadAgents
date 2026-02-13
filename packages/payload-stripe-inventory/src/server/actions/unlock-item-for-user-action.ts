import type { Payload, TypedUser } from 'payload'
import { countWeeklyUnlocksQuery } from '../../model'
import { generateUserInventory } from '../../model/builders'
import type { Result, UnlockItem, UserInventory } from '../../types'
import type { UnlockActionConfig } from '../plugin/stripe-inventory-types'

const DEFAULT_MAX_UNLOCKS_PER_WEEK = 3

const addUniqueUnlock = (unlocks: UnlockItem[], collection: string, contentId: number): UnlockItem[] => {
  const isDuplicate = unlocks.some(unlock => unlock.collection === collection && unlock.id === contentId)

  if (isDuplicate) {
    return unlocks
  }
  return [
    ...unlocks,
    {
      collection,
      id: contentId,
      dateUnlocked: new Date()
    }
  ]
}

/**
 * Default unlock validation: only checks the weekly unlock limit.
 * For permission-based validation, provide a custom `validateUnlock` callback.
 */
function defaultValidateUnlock(maxUnlocksPerWeek: number) {
  return async (
    user: TypedUser,
    _permissions: string[],
    _payload: Payload
  ): Promise<{ allowed: boolean; reason?: string }> => {
    const weeklyUnlocks = countWeeklyUnlocksQuery(user)
    if (weeklyUnlocks >= maxUnlocksPerWeek) {
      return {
        allowed: false,
        reason: `You have reached the limit of ${maxUnlocksPerWeek} unlocks for this week`
      }
    }

    return { allowed: true }
  }
}

/**
 * Creates an unlock action with the specified configuration.
 *
 * @param config - Unlock action configuration
 * @returns A function that unlocks items for users
 *
 * @example
 * ```typescript
 * const unlockItem = createUnlockAction({
 *   resolveContentPermissions: async (content, payload) => {
 *     return content.requiredPermissions || [];
 *   },
 *   userSlug: 'users',
 *   maxUnlocksPerWeek: 5,
 *   onUnlockSuccess: async (user, collection, contentId, payload) => {
 *     console.log(`User ${user.id} unlocked ${collection}/${contentId}`);
 *   },
 * });
 *
 * // Use in server actions
 * await unlockItem(payload, user, 'posts', 123);
 * ```
 */
export const createUnlockAction = <TContent = unknown>(config: UnlockActionConfig<TContent>) => {
  const { resolveContentPermissions, userSlug } = config
  const validate =
    config.validateUnlock ?? defaultValidateUnlock(config.maxUnlocksPerWeek ?? DEFAULT_MAX_UNLOCKS_PER_WEEK)

  /**
   * Unlocks an item for a user, adding it to their inventory.
   *
   * @param payload - The Payload instance
   * @param user - The authenticated user
   * @param collection - The collection slug of the item to unlock
   * @param contentId - The ID of the item to unlock
   * @returns Result indicating success or error message
   */
  return async (payload: Payload, user: TypedUser, collection: string, contentId: number): Promise<Result<boolean>> => {
    if (!user || !user.id) {
      return { error: 'Invalid user' }
    }
    // Collection slug is validated by the consumer - cast required for generic plugin
    const item = await payload.findByID({
      collection: collection as 'users',
      id: contentId.toString()
    })

    if (!item) {
      return { error: 'Item not found' }
    }
    const permissions = await resolveContentPermissions(item as TContent, payload)

    const validation = await validate(user, permissions, payload)
    if (!validation.allowed) {
      return { error: validation.reason ?? 'Unlock not allowed' }
    }

    const inventory: UserInventory = user.inventory ?? generateUserInventory()

    const updatedUnlocks = addUniqueUnlock(inventory.unlocks, collection, contentId)

    if (updatedUnlocks.length === inventory.unlocks.length) {
      return { data: true }
    }

    try {
      await payload.update({
        collection: userSlug,
        id: user.id.toString(),
        data: {
          inventory: {
            ...inventory,
            unlocks: updatedUnlocks
          }
        }
      })

      await config.onUnlockSuccess?.(user, collection, contentId, payload)

      return { data: true }
    } catch (error) {
      console.error('Error updating user inventory:', error)
      return { error: 'Error updating user inventory' }
    }
  }
}
