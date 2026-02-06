'use client'

import { BookOpen, ChevronDown, FileText, Loader2, Search, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import { cn } from '../lib/utils'
import { type Document, useCombinedDocuments, useDocumentSearch, useDocumentSelection } from './useDocumentSelector'

interface DocumentSelectorProps {
  onSelectionChange?: (selectedDocuments: Document[]) => void
  isMaximized?: boolean
  isSidePanel?: boolean
}

const DocumentSelector = ({ onSelectionChange, isSidePanel = false }: DocumentSelectorProps) => {
  const [isExpanded, setIsExpanded] = useState(isSidePanel)

  const {
    searchQuery,
    searchResults,
    isLoading,
    error,
    handleSearchChange: baseHandleSearchChange
  } = useDocumentSearch()
  const { selectedDocuments, toggleDocument, clearAllSelections } = useDocumentSelection(onSelectionChange)
  const allDocuments = useCombinedDocuments(selectedDocuments, searchResults)

  const handleSearchChange = useCallback(
    (query: string) => {
      baseHandleSearchChange(query)
      if (query.trim().length >= 2) {
        setIsExpanded(true)
      }
    },
    [baseHandleSearchChange]
  )

  const getDocumentIcon = (type: Document['type']) => {
    return type === 'book' ? <BookOpen className="w-4 h-4" /> : <FileText className="w-4 h-4" />
  }

  if (isSidePanel) {
    return (
      <div className="h-full flex flex-col bg-background border-r border-border">
        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar contenido..."
              value={searchQuery}
              onChange={e => handleSearchChange(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background pl-10 pr-3 py-1 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>

        {selectedDocuments.length > 0 && (
          <div className="flex items-center justify-between p-4 border-b border-border bg-muted/50">
            <span className="text-sm font-medium text-foreground">
              {selectedDocuments.length} documento{selectedDocuments.length !== 1 ? 's' : ''}
            </span>
            <button
              type="button"
              onClick={clearAllSelections}
              className="text-sm text-destructive hover:text-destructive/80"
            >
              Limpiar
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin mx-auto mb-2" />
              Buscando...
            </div>
          )}

          {error && <div className="p-4 text-center text-sm text-destructive">{error}</div>}

          {!isLoading && !error && searchQuery.length >= 2 && searchResults.length === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">Sin resultados para "{searchQuery}"</div>
          )}

          {!isLoading && !error && searchQuery.length < 2 && selectedDocuments.length === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">Busca libros o artículos para filtrar</div>
          )}

          {!isLoading && !error && allDocuments.length > 0 && (
            <div>
              {allDocuments.map(doc => {
                const isSelected = selectedDocuments.some(d => d.id === doc.id)
                return (
                  <button
                    type="button"
                    key={doc.id}
                    onClick={() => toggleDocument(doc)}
                    className={cn(
                      'w-full flex items-center justify-between p-4 text-left border-b border-border/50 hover:bg-muted/50 transition-colors',
                      isSelected && 'bg-primary/10'
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-muted-foreground">{getDocumentIcon(doc.type)}</span>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">{doc.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {doc.type === 'book' ? 'Libro' : 'Artículo'}
                        </div>
                      </div>
                    </div>
                    {isSelected && <X className="w-4 h-4 text-destructive flex-shrink-0" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Dropdown mode
  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="flex">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar libros o artículos..."
              value={searchQuery}
              onChange={e => handleSearchChange(e.target.value)}
              className="flex h-9 w-full rounded-l-md border border-input bg-background pl-10 pr-3 py-1 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="inline-flex items-center gap-1 h-9 rounded-r-md border border-l-0 border-input bg-background px-3 text-sm text-foreground hover:bg-accent transition-colors"
          >
            {selectedDocuments.length > 0 ? `${selectedDocuments.length} filtros` : 'Filtros'}
            <ChevronDown className={cn('w-4 h-4 transition-transform', isExpanded && 'rotate-180')} />
          </button>
        </div>

        {isExpanded && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 cursor-default bg-transparent border-none"
              onClick={() => setIsExpanded(false)}
              aria-label="Cerrar selector"
            />
            <div className="absolute top-full left-0 right-0 mt-2 bg-popover border border-border rounded-lg shadow-lg max-h-80 overflow-hidden z-50">
              {selectedDocuments.length > 0 && (
                <div className="flex items-center justify-between p-3 border-b border-border bg-muted/50">
                  <span className="text-sm font-medium text-foreground">
                    {selectedDocuments.length} seleccionado{selectedDocuments.length !== 1 ? 's' : ''}
                  </span>
                  <button
                    type="button"
                    onClick={clearAllSelections}
                    className="text-sm text-destructive hover:text-destructive/80"
                  >
                    Limpiar
                  </button>
                </div>
              )}

              <div className="max-h-64 overflow-y-auto">
                {isLoading && (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin mx-auto mb-2" />
                    Buscando...
                  </div>
                )}

                {!isLoading && !error && allDocuments.length > 0 && (
                  <div>
                    {allDocuments.map(doc => {
                      const isSelected = selectedDocuments.some(d => d.id === doc.id)
                      return (
                        <button
                          type="button"
                          key={doc.id}
                          onClick={() => toggleDocument(doc)}
                          className={cn(
                            'w-full flex items-center justify-between p-3 text-left border-b border-border/50 hover:bg-muted/50 transition-colors',
                            isSelected && 'bg-primary/10'
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-muted-foreground">{getDocumentIcon(doc.type)}</span>
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-foreground truncate">{doc.title}</div>
                              <div className="text-xs text-muted-foreground">
                                {doc.type === 'book' ? 'Libro' : 'Artículo'}
                              </div>
                            </div>
                          </div>
                          {isSelected && <X className="w-4 h-4 text-destructive flex-shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                )}

                {!isLoading && !error && searchQuery.length < 2 && selectedDocuments.length === 0 && (
                  <div className="p-4 text-center text-sm text-muted-foreground">Busca libros o artículos</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default DocumentSelector
