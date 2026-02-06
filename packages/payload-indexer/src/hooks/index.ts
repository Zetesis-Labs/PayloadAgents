/**
 * Hook utilities for payload-indexer
 * These provide generic hook patterns that can be used by adapter implementations
 */

// Export hook types (to be expanded as needed)
export interface SyncHookContext {
  operation: 'create' | 'update' | 'delete'
  documentId: string
  collectionSlug: string
}
