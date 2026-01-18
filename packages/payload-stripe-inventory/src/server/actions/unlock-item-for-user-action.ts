import { Payload } from "payload";
import {
  checkIfUserCanUnlockQuery,
  COLLECTION_SLUG_USER,
  countWeeklyUnlocksQuery,
  MAX_UNLOCKS_PER_WEEK,
} from "../../model/index.js";
import { generateUserInventory } from "../../model/builders.js";
import { getPermissionsSlugs } from "../../model/permissions.js";
import type { BaseUser, UnlockItem, UserInventory } from "../../types/index.js";

export type Result<T, E = string> = {
    data: T;
    error?: never;
} | {
    data?: never;
    error: E;
}


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
 * Unlocks an item for a user, adding it to their inventory.
 *
 * @param payload - The Payload instance
 * @param user - The authenticated user
 * @param collection - The collection slug of the item to unlock
 * @param contentId - The ID of the item to unlock
 * @returns Result indicating success or error message
 */
export const unlockItemForUser = async (
  payload: Payload,
  user: BaseUser,
  collection: string,
  contentId: number
): Promise<Result<boolean>> => {
  if (!user || !user.id) {
    return { error: "Usuario no válido" };
  }
  const item = await payload.findByID({
    collection: collection as any,
    id: contentId.toString(),
  });

  if (!item) {
    return { error: "Elemento no encontrado" };
  }
  const permissions = getPermissionsSlugs({ permissions: item.permissions });

  if (!checkIfUserCanUnlockQuery(user, permissions)) {
    return { error: "No tienes permisos para desbloquear este elemento" };
  }

  const weeklyUnlocks = countWeeklyUnlocksQuery(user);
  if (weeklyUnlocks >= MAX_UNLOCKS_PER_WEEK) {
    return {
      error: `Has alcanzado el límite de ${MAX_UNLOCKS_PER_WEEK} desbloqueos para esta semana`,
    };
  }

  const inventory =
    (user.inventory as UserInventory) ?? generateUserInventory();

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
