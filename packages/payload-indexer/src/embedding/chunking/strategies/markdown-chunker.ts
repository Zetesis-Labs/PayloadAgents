/**
 * Markdown chunking strategy using LangChain's MarkdownTextSplitter
 * Splits markdown text respecting markdown structure and preserves header metadata
 */

import { MarkdownTextSplitter } from "@langchain/textsplitters";
import {
  DEFAULT_CHUNK_SIZE,
  DEFAULT_OVERLAP,
} from "../../../core/config/constants";
import type { ChunkOptions, TextChunk } from "../types";

/**
 * Header information extracted from markdown
 */
interface HeaderInfo {
  level: number;
  text: string;
  position: number;
}

/**
 * Extracts markdown headers and their positions from text
 */
const extractHeaders = (text: string): HeaderInfo[] => {
  const headerRegex = /^(#{1,6})\s+(.+)$/gm;
  const headers: HeaderInfo[] = [];
  let match;

  while ((match = headerRegex.exec(text)) !== null) {
    headers.push({
      level: match[1]?.length ?? 0,
      text: match[2]?.trim() ?? "",
      position: match.index,
    });
  }

  return headers;
};

/**
 * Finds the headers that apply to a given chunk based on its content
 */
const findChunkHeaders = (
  chunkText: string,
  allHeaders: HeaderInfo[],
  fullText: string,
): Record<string, string> => {
  // Find the position of this chunk in the original text
  const chunkPosition = fullText.indexOf(
    chunkText.substring(0, Math.min(50, chunkText.length)),
  );

  if (chunkPosition === -1) {
    return {};
  }

  // Find all headers that come before or at this chunk's position
  const applicableHeaders = allHeaders.filter(
    (h) => h.position <= chunkPosition,
  );

  if (applicableHeaders.length === 0) {
    return {};
  }

  // Build the header hierarchy for this chunk
  const metadata: Record<string, string> = {};
  const currentHierarchy: (HeaderInfo | null)[] = Array(6).fill(null);

  for (const header of applicableHeaders) {
    // Set this header at its level
    currentHierarchy[header.level - 1] = header;

    // Clear all deeper levels
    for (let i = header.level; i < 6; i++) {
      currentHierarchy[i] = null;
    }
  }

  // Build the metadata object
  for (let i = 0; i < 6; i++) {
    if (currentHierarchy[i]) {
      metadata[`Header ${i + 1}`] = currentHierarchy[i]!.text;
    }
  }

  return metadata;
};

/**
 * Chunks markdown text using LangChain's MarkdownTextSplitter
 * Respects markdown structure and extracts header metadata for each chunk
 */
export const chunkMarkdown = async (
  text: string,
  options: ChunkOptions = {},
): Promise<TextChunk[]> => {
  const { maxChunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_OVERLAP } =
    options;

  if (!text || text.trim().length === 0) {
    return [];
  }

  // Extract all headers from the text
  const headers = extractHeaders(text);

  // Create markdown-aware splitter
  const splitter = new MarkdownTextSplitter({
    chunkSize: maxChunkSize,
    chunkOverlap: overlap,
  });

  // Split the text
  const chunks = await splitter.createDocuments([text]);

  // Convert to our TextChunk format, adding header metadata
  return chunks.map((chunk, index) => {
    const metadata = findChunkHeaders(chunk.pageContent, headers, text);

    return {
      text: chunk.pageContent,
      index,
      startIndex: 0,
      endIndex: chunk.pageContent.length,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    };
  });
};
