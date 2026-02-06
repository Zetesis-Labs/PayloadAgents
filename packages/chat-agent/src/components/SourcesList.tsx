"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, ChevronDown, FileText, List, Loader2, X } from "lucide-react";
import React, { useState } from "react";
import { useChunkLoader } from "../hooks/useChunkLoader";
import { cn } from "../lib/utils";
import { LinkComponent } from "../types/components";
import { MarkdownText } from "./assistant-ui/markdown-text";
import { ViewMoreLink } from "./buttons/ViewMoreLink";

interface Source {
  id: string;
  title: string;
  slug: string;
  type: "article" | "book";
  chunkIndex: number;
  relevanceScore: number;
  content: string;
  excerpt?: string;
}

interface SourcesListProps {
  sources: Source[];
  isMaximized?: boolean;
  onMinimize?: () => void;
  generateHref: (props: { type: string; value: { id: number; slug?: string | null } }) => string;
  LinkComponent?: LinkComponent;
  renderSourceIcon?: (type: "article" | "book") => React.ReactNode;
  renderViewMore?: (props: {
    type: "article" | "book";
    slug: string;
    title: string;
    onClick?: () => void;
  }) => React.ReactNode;
}

// Animation variants
const listVariants = {
  hidden: { opacity: 0, height: 0, transition: { duration: 0.2, ease: "easeInOut" as const } },
  visible: { opacity: 1, height: "auto", transition: { duration: 0.3, ease: "easeOut" as const } },
};

const expandedCardVariants = {
  hidden: { opacity: 0, scale: 0.95, y: -10, transition: { duration: 0.2, ease: "easeInOut" as const } },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] as const } },
  exit: { opacity: 0, scale: 0.95, y: -10, transition: { duration: 0.2, ease: "easeInOut" as const } },
};

const contentVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { delay: 0.1, duration: 0.3, ease: "easeOut" as const } },
};

const itemVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: {
      delay: i * 0.05,
      duration: 0.2,
      ease: "easeOut" as const
    }
  })
};

// Helper to parse chunk content
const parseChunkContent = (content: string) => {
  const separator = ".________________________________________.";
  if (!content || !content.includes(separator)) {
    return { text: content, metadata: null };
  }

  const [text = "", metadataRaw] = content.split(separator);
  const metadata: { section?: string; path?: string } = {};

  if (metadataRaw) {
    const parts = metadataRaw.split("|");
    parts.forEach(part => {
      const trimmed = part.trim();
      if (trimmed.toLowerCase().startsWith("section:")) {
        metadata.section = trimmed.substring("section:".length).trim();
      } else if (trimmed.toLowerCase().startsWith("path:")) {
        metadata.path = trimmed.substring("path:".length).trim();
      }
    });
  }

  return { text: text.trim(), metadata };
};

// Relevance bar component
const RelevanceBar: React.FC<{ score: number }> = ({ score }) => {
  const percentage = Math.min(Math.max(score * 100, 0), 100);
  const getColor = () => {
    if (percentage >= 80) return "bg-green-500";
    if (percentage >= 60) return "bg-primary";
    if (percentage >= 40) return "bg-yellow-500";
    return "bg-muted-foreground";
  };

  return (
    <div className="flex items-center gap-2">
      <div className="h-1 w-12 rounded-full bg-secondary overflow-hidden">
        <motion.div
          className={cn("h-full rounded-full", getColor())}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground">
        {Math.round(percentage)}%
      </span>
    </div>
  );
};

export const SourcesList: React.FC<SourcesListProps> = ({
  sources,
  isMaximized = false,
  onMinimize,
  generateHref,
  LinkComponent,
  renderSourceIcon,
  renderViewMore,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null);
  const [loadedContent, setLoadedContent] = useState<string>("");

  const { loadChunkContent, getChunkState } = useChunkLoader();

  const handleViewMore = () => {
    if (isMaximized && onMinimize) {
      onMinimize();
    }
  };

  if (!sources || sources.length === 0) {
    return null;
  }

  const getIcon = (type: "article" | "book") => {
    if (renderSourceIcon) return renderSourceIcon(type);
    return type === "book" ? <BookOpen className="w-full h-full" /> : <FileText className="w-full h-full" />;
  };

  const handleSourceClick = async (sourceId: string) => {
    setExpandedSourceId(sourceId);
    setLoadedContent("");

    const source = sources.find(s => s.id === sourceId);
    if (!source) return;

    if (source.content) {
      setLoadedContent(source.content);
      return;
    }

    const content = await loadChunkContent(sourceId, source.type);
    setLoadedContent(content);
  };

  const handleCloseExpanded = () => {
    setExpandedSourceId(null);
    setLoadedContent("");
  };

  // If a source is expanded, show only that one
  if (expandedSourceId) {
    const expandedSource = sources.find(s => s.id === expandedSourceId);
    if (!expandedSource) return null;

    const chunkState = getChunkState(expandedSource.id, expandedSource.type);
    const displayContent = loadedContent || expandedSource.content;
    const { text: cleanContent, metadata } = parseChunkContent(displayContent);

    return (
      <div className="mt-3 pt-3 border-t border-border">
        <AnimatePresence mode="wait">
          <motion.div
            key={expandedSourceId}
            variants={expandedCardVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            layoutId={`source-${expandedSourceId}`}
          >
            <div className="p-4 bg-muted rounded-lg border border-border shadow-sm">
              {/* Header with close button */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-2 flex-1">
                  <motion.div
                    className="flex-shrink-0 w-5 h-5 text-foreground mt-0.5"
                    initial={{ rotate: -10 }}
                    animate={{ rotate: 0 }}
                    transition={{ type: "spring", stiffness: 300 }}
                  >
                    {getIcon(expandedSource.type)}
                  </motion.div>
                  <div>
                    <div className="text-foreground font-semibold text-sm">
                      {expandedSource.title}
                    </div>
                    <div className="text-muted-foreground text-xs mt-1 flex items-center gap-2">
                      <span>
                        {expandedSource.type === "article" ? "Articulo" : "Libro"}
                        {expandedSource.chunkIndex !== undefined && (
                          <> - Parte {expandedSource.chunkIndex + 1}</>
                        )}
                      </span>
                      {expandedSource.relevanceScore && (
                        <RelevanceBar score={expandedSource.relevanceScore} />
                      )}
                    </div>
                  </div>
                </div>
                <motion.button
                  onClick={handleCloseExpanded}
                  className="flex-shrink-0 ml-2 h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  aria-label="Cerrar"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <X className="w-4 h-4" />
                </motion.button>
              </div>

              {/* Content - rendered markdown */}
              <motion.div variants={contentVariants} initial="hidden" animate="visible">
                {chunkState.isLoading ? (
                  <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Cargando contenido...
                  </div>
                ) : chunkState.error ? (
                  <div className="text-sm text-destructive py-2">
                    Error: {chunkState.error}
                  </div>
                ) : displayContent ? (
                  <>
                    <MarkdownText text={cleanContent} />

                    {/* Metadata Pills - Breadcrumb hierarchy */}
                    {metadata && (metadata.path || metadata.section) && (
                      <div className="mt-4 flex flex-wrap items-center gap-2 mb-3">
                        <span className="text-xs text-muted-foreground">Ubicacion:</span>
                        {metadata.path ? (
                          metadata.path.split(">").map((segment, index, arr) => {
                            const text = segment.trim()
                            const truncated = text.length > 25 ? text.slice(0, 25) + "..." : text
                            return (
                              <React.Fragment key={index}>
                                <motion.span
                                  className="inline-flex items-center rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-medium text-foreground max-w-[150px]"
                                  initial={{ opacity: 0, scale: 0.9 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={{ delay: index * 0.05 }}
                                  title={text}
                                >
                                  <span className="truncate">{truncated}</span>
                                </motion.span>
                                {index < arr.length - 1 && (
                                  <span className="text-muted-foreground text-xs">/</span>
                                )}
                              </React.Fragment>
                            )
                          })
                        ) : metadata.section ? (
                          <span
                            className="inline-flex items-center rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-medium text-foreground max-w-[150px]"
                            title={metadata.section}
                          >
                            <span className="truncate">
                              {metadata.section.length > 25 ? metadata.section.slice(0, 25) + "..." : metadata.section}
                            </span>
                          </span>
                        ) : null}
                      </div>
                    )}

                    {/* Link to full document */}
                    {renderViewMore ? (
                      renderViewMore({
                        type: expandedSource.type,
                        slug: expandedSource.slug,
                        title: expandedSource.title,
                        onClick: handleViewMore,
                      })
                    ) : (
                      <ViewMoreLink
                        type={expandedSource.type}
                        slug={expandedSource.slug}
                        title={expandedSource.title}
                        onClick={handleViewMore}
                        generateHref={generateHref}
                        LinkComponent={LinkComponent}
                      />
                    )}
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground py-2">
                    No hay contenido disponible para este fragmento
                  </div>
                )}
              </motion.div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  // Show collapsed list
  return (
    <div className="mt-3 pt-3 border-t border-border">
      {/* Header - clickable to expand/collapse */}
      <motion.button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left flex items-center justify-between hover:opacity-75 transition-opacity group"
        whileTap={{ scale: 0.98 }}
      >
        <div className="flex items-center gap-2">
          <List className="w-4 h-4 text-foreground" />
          <p className="text-xs font-semibold text-foreground">
            Fuentes consultadas
          </p>
          <motion.span
            className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-xs font-medium"
            initial={{ scale: 1 }}
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 0.3 }}
            key={sources.length}
          >
            {sources.length}
          </motion.span>
        </div>
        <motion.div
          animate={{ rotate: isExpanded ? 0 : -90 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </motion.div>
      </motion.button>

      {/* Sources list - shown when expanded */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            variants={listVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="mt-2 space-y-2 overflow-hidden"
          >
            {sources.map((source, idx) => (
              <motion.button
                key={source.id || idx}
                custom={idx}
                variants={itemVariants}
                initial="hidden"
                animate="visible"
                onClick={() => handleSourceClick(source.id)}
                className="w-full text-left text-xs rounded-lg p-3 transition-all border border-transparent hover:border-primary/20 hover:bg-muted/50 group"
                whileHover={{ x: 4 }}
                layoutId={`source-${source.id}`}
              >
                <div className="flex items-start gap-2">
                  <motion.div
                    className="flex-shrink-0 w-4 h-4 text-foreground mt-0.5"
                    whileHover={{ scale: 1.1, rotate: 5 }}
                  >
                    {getIcon(source.type)}
                  </motion.div>

                  <div className="flex-1 min-w-0">
                    <div className="text-foreground font-medium truncate group-hover:text-primary transition-colors">
                      {source.title}
                    </div>

                    <div className="text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                      <span className="text-xs">
                        {source.type === "article" ? "Articulo" : "Libro"}
                      </span>
                      {source.chunkIndex !== undefined && (
                        <>
                          <span>-</span>
                          <span className="text-xs">
                            Parte {source.chunkIndex + 1}
                          </span>
                        </>
                      )}
                      {source.relevanceScore && (
                        <RelevanceBar score={source.relevanceScore} />
                      )}
                    </div>

                    {source.excerpt && (
                      <div className="text-muted-foreground mt-1 text-xs line-clamp-2 italic">
                        <MarkdownText text={`"${source.excerpt}"`} />
                      </div>
                    )}
                  </div>

                  <motion.span
                    className="text-primary flex-shrink-0 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    initial={{ x: -5 }}
                    whileHover={{ x: 0 }}
                  >
                    Ver mas
                  </motion.span>
                </div>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
