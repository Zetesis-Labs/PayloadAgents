export type ImportMode = 'import' | 'import-sync' | 'sync'
export type CollectionTarget = 'posts' | 'books'

export interface SyncResults {
  synced: number
  errors: string[]
}

export interface ImportResult {
  success: boolean
  message: string
  agentSlug?: string
  dataFile?: string
  totalEntries?: number
  results?: {
    imported: number
    skipped: number
    errors: string[]
  }
  syncResults?: SyncResults
  needsSync?: boolean
}
