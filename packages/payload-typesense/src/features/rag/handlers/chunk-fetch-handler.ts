/**
 * Chunk fetch handler
 *
 * Handles fetching individual chunk documents by ID from Typesense
 */

import type { Client } from "typesense";
import { TypesenseRAGChunkDocument } from "../../../shared/index";

/**
 * Configuration for fetching a chunk by ID
 */
export type ChunkFetchConfig = {
  /** Chunk document ID */
  chunkId: string;
  /** Collection name */
  collectionName: string;
  /** Valid collection names for validation */
  validCollections?: string[];
};

/**
 * Result of fetching a chunk
 */
export type ChunkFetchResult = {
  id: string;
  chunk_text: string;
  title?: string;
  slug?: string;
  chunk_index?: number;
  collection: string;
};

/**
 * Fetch a chunk document by ID from Typesense
 *
 * @param client - Typesense client instance
 * @param config - Chunk fetch configuration
 * @returns Promise with chunk data
 * @throws Error if chunk not found or collection is invalid
 */
export async function fetchChunkById(
  client: Client,
  config: ChunkFetchConfig,
): Promise<ChunkFetchResult> {
  const { chunkId, collectionName, validCollections } = config;

  // Validate collection if validCollections is provided
  if (validCollections && !validCollections.includes(collectionName)) {
    throw new Error(
      `Invalid collection: ${collectionName}. Must be one of: ${validCollections.join(", ")}`,
    );
  }

  try {
    // Retrieve the document from Typesense
    const document = (await client
      .collections(collectionName)
      .documents(chunkId)
      .retrieve()) as TypesenseRAGChunkDocument;

    // Extract chunk data
    const chunkText = document.chunk_text || "";

    if (!chunkText) {
      throw new Error("Chunk contains no text");
    }

    return {
      id: document.id,
      chunk_text: chunkText,
      title: document.title,
      slug: document.slug,
      chunk_index: document.chunk_index,
      collection: collectionName,
    };
  } catch (error: unknown) {
    // Handle Typesense 404 errors
    if (
      error &&
      typeof error === "object" &&
      "httpStatus" in error &&
      error.httpStatus === 404
    ) {
      throw new Error(`Chunk not found: ${chunkId}`);
    }
    throw error;
  }
}
