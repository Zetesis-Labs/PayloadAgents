import { useState, useCallback } from 'react'

interface ChunkData {
  chunk_text: string
  title: string
  slug: string
  chunk_index: number
  collection: string
}

interface ChunkCache {
  [key: string]: {
    content: string
    isLoading: boolean
    error: string | null
  }
}

/**
 * Hook to lazy-load chunk content from the API
 */
export function useChunkLoader() {
  const [chunkCache, setChunkCache] = useState<ChunkCache>({})

  /**
   * Get the collection name based on document type
   */
  const getCollectionName = useCallback((type: 'article' | 'book'): string => {
    return type === 'book' ? 'books_chunk' : 'posts_chunk'
  }, [])

  /**
   * Load chunk content from the API
   */
  const loadChunkContent = useCallback(
    async (chunkId: string, type: 'article' | 'book'): Promise<string> => {
      const cacheKey = `${type}_${chunkId}`

      // Return cached content if available
      if (chunkCache[cacheKey]?.content) {
        return chunkCache[cacheKey].content
      }

      // Return empty if already loading
      if (chunkCache[cacheKey]?.isLoading) {
        return ''
      }

      // Mark as loading
      setChunkCache((prev) => ({
        ...prev,
        [cacheKey]: {
          content: '',
          isLoading: true,
          error: null,
        },
      }))

      try {
        const collectionName = getCollectionName(type)
        const url = `/api/chat/chunks/${encodeURIComponent(chunkId)}?collection=${encodeURIComponent(collectionName)}`

        const response = await fetch(url)

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Error al cargar el chunk')
        }

        const data: ChunkData = await response.json()

        // Update cache with loaded content
        setChunkCache((prev) => ({
          ...prev,
          [cacheKey]: {
            content: data.chunk_text,
            isLoading: false,
            error: null,
          },
        }))

        return data.chunk_text
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Error desconocido al cargar el chunk'

        // Update cache with error
        setChunkCache((prev) => ({
          ...prev,
          [cacheKey]: {
            content: '',
            isLoading: false,
            error: errorMessage,
          },
        }))

        console.error('[useChunkLoader] Error loading chunk:', error)
        return ''
      }
    },
    [chunkCache, getCollectionName]
  )

  /**
   * Get the current state of a chunk
   */
  const getChunkState = useCallback(
    (chunkId: string, type: 'article' | 'book') => {
      const cacheKey = `${type}_${chunkId}`
      return (
        chunkCache[cacheKey] || {
          content: '',
          isLoading: false,
          error: null,
        }
      )
    },
    [chunkCache]
  )

  return {
    loadChunkContent,
    getChunkState,
  }
}
