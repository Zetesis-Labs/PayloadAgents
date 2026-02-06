import { debounce } from 'lodash'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const isDev = process.env.NODE_ENV === 'development'

export interface Document {
  id: string
  title: string
  slug: string
  type: 'article' | 'book'
  collection: string
}

/**
 * Hook for managing document search functionality
 */
export function useDocumentSearch() {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Document[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Search function (not debounced)
  const performSearch = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setSearchResults([])
      setIsLoading(false)
      return
    }

    if (isDev) console.log('[DocumentSelector] Searching for:', query)
    setIsLoading(true)
    setError(null)

    try {
      // Build query parameters for the search endpoint
      const params = new URLSearchParams({
        q: query,
        exclude_fields: 'embedding,content,lexical_richtext',
        query_by: 'title',
        simple: 'true',
        mode: 'simple',
        per_page: '15'
      })
      // Add multiple collection parameters
      params.append('collection', 'book')
      params.append('collection', 'article_web')

      const url = `/api/search?${params}`
      if (isDev) console.log('[DocumentSelector] Fetching URL:', url)

      const response = await fetch(url)
      if (isDev) console.log('[DocumentSelector] Response status:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        if (isDev) console.error('[DocumentSelector] API error:', response.status, errorText)
        throw new Error(`Error ${response.status}: ${errorText}`)
      }

      const data = await response.json()
      if (isDev) {
        console.log('[DocumentSelector] API response:', data)
        console.log('[DocumentSelector] Documents found:', data.documents?.length || 0)

        if (data.documents && data.documents.length > 0) {
          console.log(
            '[DocumentSelector] Sample document titles:',
            data.documents.slice(0, 3).map((d: any) => d.title)
          )
        }
      }

      setSearchResults(data.documents || [])
    } catch (err) {
      if (isDev) console.error('[DocumentSelector] Error searching documents:', err)
      setError(err instanceof Error ? err.message : 'Error desconocido')
      setSearchResults([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Create debounced version using useMemo
  const debouncedSearch = useMemo(() => debounce(performSearch, 300), [performSearch])

  // Cleanup debounced function on unmount
  useEffect(() => {
    return () => {
      debouncedSearch.cancel()
    }
  }, [debouncedSearch])

  // Handle search query changes
  const handleSearchChange = useCallback(
    (query: string) => {
      setSearchQuery(query)
      if (query.trim().length >= 2) {
        setIsLoading(true)
        debouncedSearch(query)
      } else {
        setSearchResults([])
        setIsLoading(false)
      }
    },
    [debouncedSearch]
  )

  return {
    searchQuery,
    searchResults,
    isLoading,
    error,
    handleSearchChange
  }
}

/**
 * Hook for managing document selection
 */
export function useDocumentSelection(onSelectionChange?: (selectedDocuments: Document[]) => void) {
  const [selectedDocuments, setSelectedDocuments] = useState<Document[]>([])

  // Keep a ref to the latest onSelectionChange to avoid unnecessary effect runs
  const onSelectionChangeRef = useRef(onSelectionChange)
  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange
  }, [onSelectionChange])

  // Notify parent when selection changes
  useEffect(() => {
    onSelectionChangeRef.current?.(selectedDocuments)
  }, [selectedDocuments])

  // Toggle document selection
  const toggleDocument = useCallback((document: Document) => {
    setSelectedDocuments(prev => {
      const isSelected = prev.some(d => d.id === document.id)
      return isSelected ? prev.filter(d => d.id !== document.id) : [...prev, document]
    })
  }, [])

  // Remove document from selection
  const removeDocument = useCallback((documentId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedDocuments(prev => prev.filter(d => d.id !== documentId))
  }, [])

  // Clear all selections
  const clearAllSelections = useCallback(() => {
    setSelectedDocuments([])
  }, [])

  return {
    selectedDocuments,
    toggleDocument,
    removeDocument,
    clearAllSelections
  }
}

/**
 * Hook for combining selected documents with search results
 * Optimized with Set for O(n) complexity instead of O(n*m)
 */
export function useCombinedDocuments(selectedDocuments: Document[], searchResults: Document[]) {
  return useMemo(() => {
    const combined = [...selectedDocuments]
    const selectedIds = new Set(selectedDocuments.map(doc => doc.id))

    // Add search results that aren't already selected
    searchResults.forEach(doc => {
      if (!selectedIds.has(doc.id)) {
        combined.push(doc)
      }
    })

    return combined
  }, [selectedDocuments, searchResults])
}
