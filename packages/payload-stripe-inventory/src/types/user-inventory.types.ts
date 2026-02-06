export interface UnlockItem {
  collection: string
  id: number
  dateUnlocked: Date
  payload?: Record<string, unknown>
}

export interface FavoriteItem {
  collection: string
  id: number
  dateUnlocked: Date
  payload?: Record<string, unknown>
}

export interface UserInventory {
  unlocks: UnlockItem[]
  favorites: FavoriteItem[]
}
