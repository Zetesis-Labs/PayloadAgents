import { BaseUser, UserInventory } from "../types/index.js";
/**
 * Cuenta cuántos elementos ha desbloqueado el usuario en los últimos 7 días
 * @param user Usuario base
 * @returns Número de elementos desbloqueados en los últimos 7 días
 */

export const countWeeklyUnlocksQuery = (
  user: BaseUser<UserInventory>
): number => {
  const inventory = user.inventory;
  if (!inventory || !inventory.unlocks || inventory.unlocks.length === 0) {
    return 0;
  }

  // Use UTC to ensure consistent counting regardless of server timezone
  const now = Date.now();
  const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
  const sevenDaysAgo = now - sevenDaysInMs;

  return inventory.unlocks.filter(
    unlock => new Date(unlock.dateUnlocked).getTime() >= sevenDaysAgo
  ).length;
};
