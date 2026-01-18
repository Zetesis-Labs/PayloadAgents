import { Payload } from "payload";
import {
  checkIfUserCanUnlockQuery,
  COLLECTION_SLUG_USER,
  countWeeklyUnlocksQuery,
  MAX_UNLOCKS_PER_WEEK,
} from "../../model/index.js";
import { generateUserInventory } from "../../model/builders.js";
import type { BaseUser, UnlockItem, UserInventory, Result } from "../../types/index.js";
import type { ResolveContentPermissions } from "../plugin/stripe-inventory-types.js";


const addUniqueUnlock = (
  unlocks: UnlockItem[],
  collection: string,
  contentId: number
): UnlockItem[] => {
  const isDuplicate = unlocks.some(
    unlock => unlock.collection === collection && unlock.id === contentId
  );

  if (isDuplicate) {
    return unlocks;
  }
  return [
    ...unlocks,
    {
      collection,
      id: contentId,
      dateUnlocked: new Date(),
    },
  ];
};

/**
 * Creates an unlock action with the specified content permissions resolver.
 *
 * @param resolveContentPermissions - Callback to resolve permissions required by content
 * @returns A function that unlocks items for users
 *
 * @example
 * ```typescript
 * const unlockItem = createUnlockAction(async (content, payload) => {
 *   return content.requiredPermissions || [];
 * });
 *
 * // Use in server actions
 * await unlockItem(payload, user, 'posts', 123);
 * ```
 */
export const createUnlockAction = <TContent = unknown>(
  resolveContentPermissions: ResolveContentPermissions<TContent>
) => {
  /**
   * Unlocks an item for a user, adding it to their inventory.
   *
   * @param payload - The Payload instance
   * @param user - The authenticated user
   * @param collection - The collection slug of the item to unlock
   * @param contentId - The ID of the item to unlock
   * @returns Result indicating success or error message
   */
  return async (
    payload: Payload,
    user: BaseUser,
    collection: string,
    contentId: number
  ): Promise<Result<boolean>> => {
    if (!user || !user.id) {
      return { error: "Usuario no válido" };
    }
    // Collection slug is validated by the consumer - cast required for generic plugin
    const item = await payload.findByID({
      collection: collection as "users",
      id: contentId.toString(),
    });

    if (!item) {
      return { error: "Elemento no encontrado" };
    }
    const permissions = await resolveContentPermissions(item as TContent, payload);

    if (!checkIfUserCanUnlockQuery(user, permissions)) {
      return { error: "No tienes permisos para desbloquear este elemento" };
    }

    const weeklyUnlocks = countWeeklyUnlocksQuery(user);
    if (weeklyUnlocks >= MAX_UNLOCKS_PER_WEEK) {
      return {
        error: `Has alcanzado el límite de ${MAX_UNLOCKS_PER_WEEK} desbloqueos para esta semana`,
      };
    }

    const inventory: UserInventory =
      (user.inventory as UserInventory | undefined) ?? generateUserInventory();

    const updatedUnlocks = addUniqueUnlock(
      inventory.unlocks,
      collection,
      contentId
    );

    if (updatedUnlocks.length === inventory.unlocks.length) {
      return { data: true };
    }

    try {
      await payload.update({
        collection: COLLECTION_SLUG_USER,
        id: user.id.toString(),
        data: {
          inventory: {
            ...inventory,
            unlocks: updatedUnlocks,
          },
        },
      });

      return { data: true };
    } catch (error) {
      console.error("Error al actualizar el inventario del usuario:", error);
      return { error: "Error al actualizar el inventario del usuario" };
    }
  };
};
