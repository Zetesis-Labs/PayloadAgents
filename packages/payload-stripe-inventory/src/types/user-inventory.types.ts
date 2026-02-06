export interface UnlockItem {
  collection: string
  id: number
  dateUnlocked: Date
  payload?: any
}

export interface FavoriteItem {
  collection: string
  id: number
  dateUnlocked: Date
  payload?: any
}

export interface UserInventory {
  unlocks: UnlockItem[]
  favorites: FavoriteItem[]
}
