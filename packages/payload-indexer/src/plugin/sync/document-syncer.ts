/**
 * Document syncer - syncs Payload documents to the index using the adapter
 */

import type { IndexDocument, IndexerAdapter } from "../../adapter/types.js";
import { logger } from "../../core/logging/logger.js";
import { formatChunkWithHeaders } from "../../core/utils/chunk-format-utils.js";
import { buildHeaderHierarchy } from "../../core/utils/header-utils.js";
import { mapPayloadDocumentToIndex } from "../../document/field-mapper.js";
import type { PayloadDocument, TableConfig } from "../../document/types.js";
import {
  chunkMarkdown,
  chunkText,
} from "../../embedding/chunking/strategies/index.js";
import type { EmbeddingService } from "../../embedding/types.js";
import { getIndexCollectionName } from "../utils/naming.js";

/**
 * Syncs a Payload document to the index
 * Uses Strategy pattern to handle both chunked and full document approaches
 *
 * @param adapter - The indexer adapter to use
 * @param collectionSlug - The Payload collection slug
 * @param doc - The document to sync
 * @param operation - The operation being performed
 * @param tableConfig - The table configuration
 * @param embeddingService - Optional embedding service
 */
export const syncDocumentToIndex = async (
  adapter: IndexerAdapter,
  collectionSlug: string,
  doc: PayloadDocument,
  operation: "create" | "update",
  tableConfig: TableConfig,
  embeddingService?: EmbeddingService,
) => {
  const tableName = getIndexCollectionName(collectionSlug, tableConfig);

  logger.debug("Syncing document to index", {
    documentId: doc.id,
    collection: collectionSlug,
    tableName,
    operation,
  });

  const syncer = new DocumentSyncer(
    adapter,
    collectionSlug,
    tableName,
    tableConfig,
    embeddingService,
  );
  await syncer.sync(doc, operation);

  logger.info("Document synced successfully to index", {
    documentId: doc.id,
    collection: collectionSlug,
    tableName,
    operation,
  });
};

/**
 * Deletes a document from the index
 * Handles both direct document deletion and chunk deletion
 *
 * @param adapter - The indexer adapter to use
 * @param collectionSlug - The Payload collection slug
 * @param docId - The document ID to delete
 * @param tableConfig - The table configuration
 */
/**
 * Deletes a document and all associated chunks from all tables for a collection
 * @param adapter - The indexer adapter to use
 * @param collectionSlug - The Payload collection slug
 * @param docId - The document ID to delete
 * @param tableConfigs - All table configurations for the collection
 */
/**
 * Deletes a document and all associated chunks from one or more tables for a collection
 * @param adapter - The indexer adapter to use
 * @param collectionSlug - The Payload collection slug
 * @param docId - The document ID to delete
 * @param tableConfigs - One or more table configurations for the collection
 */
export const deleteDocumentFromIndex = async (
  adapter: IndexerAdapter,
  collectionSlug: string,
  docId: string,
  tableConfigs: TableConfig | TableConfig[],
) => {
  const configs = Array.isArray(tableConfigs) ? tableConfigs : [tableConfigs];
  for (const tableConfig of configs) {
    const tableName = getIndexCollectionName(collectionSlug, tableConfig);
    try {
      // Si la tabla es de chunks (embedding.chunking), borra solo por parent_doc_id
      if (tableConfig.embedding?.chunking) {
        logger.debug("Deleting all chunks by parent_doc_id", {
          parent_doc_id: docId,
          tableName,
        });
        await adapter.deleteDocumentsByFilter(tableName, {
          parent_doc_id: docId,
        });
        logger.info("All chunks deleted for document", {
          documentId: docId,
          tableName,
        });
      } else {
        // Tabla principal: borra por id y si no existe, intenta por parent_doc_id
        try {
          await adapter.deleteDocument(tableName, docId);
          logger.info("Document deleted from index", {
            documentId: docId,
            tableName,
          });
        } catch (docDeleteError: unknown) {
          logger.debug("Document not found, attempting to delete chunks", {
            documentId: docId,
            tableName,
          });
          try {
            await adapter.deleteDocumentsByFilter(tableName, {
              parent_doc_id: docId,
            });
            logger.info("All chunks deleted for document", {
              documentId: docId,
              tableName,
            });
          } catch (chunkDeleteError: unknown) {
            logger.debug("No chunks found to delete", { documentId: docId });
          }
        }
      }
    } catch (error: unknown) {
      logger.error("Failed to delete document from index", error as Error, {
        documentId: docId,
        collection: collectionSlug,
        tableName,
      });
    }
  }
};

/**
 * Document syncer class that handles the actual sync logic
 */
export class DocumentSyncer {
  constructor(
    private adapter: IndexerAdapter,
    private collectionSlug: string,
    private tableName: string,
    private config: TableConfig,
    private embeddingService?: EmbeddingService,
  ) {}

  async sync(
    doc: PayloadDocument,
    operation: "create" | "update",
  ): Promise<void> {
    logger.debug(`Syncing document ${doc.id} to table ${this.tableName}`);

    if (this.config.embedding?.chunking) {
      await this.syncChunked(doc, operation);
    } else {
      await this.syncDocument(doc, operation);
    }
  }

  private async syncDocument(
    doc: PayloadDocument,
    operation: "create" | "update",
  ): Promise<void> {
    // 1. Map fields
    const mappedFields = await mapPayloadDocumentToIndex(
      doc,
      this.config.fields,
    );

    // 2. Build index document with standard fields
    const indexDoc = {
      ...mappedFields,
      id: String(doc.id),
      slug: doc.slug || "",
      createdAt: new Date(doc.createdAt).getTime(),
      updatedAt: new Date(doc.updatedAt).getTime(),
      ...(doc.publishedAt && {
        publishedAt: new Date(doc.publishedAt).getTime(),
      }),
    };

    // 3. Generate embedding if configured
    if (this.config.embedding?.fields && this.embeddingService) {
      const sourceText = await this.extractSourceText(doc);
      if (sourceText) {
        const embedding = await this.embeddingService.getEmbedding(sourceText);
        if (embedding) {
          (indexDoc as Record<string, unknown>).embedding = embedding;
        } else {
          logger.warn("Embedding generation failed for document", {
            documentId: doc.id,
            collection: this.collectionSlug,
            textLength: sourceText.length,
            textPreview:
              sourceText.substring(0, 200) +
              (sourceText.length > 200 ? "..." : ""),
          });
        }
      }
    }

    // 4. Upsert using adapter
    await this.adapter.upsertDocument(
      this.tableName,
      indexDoc as IndexDocument,
    );

    logger.info(`Synced document ${doc.id} to ${this.tableName}`);
  }

  private async syncChunked(
    doc: PayloadDocument,
    operation: "create" | "update",
  ): Promise<void> {
    // 1. Extract source text
    const sourceText = await this.extractSourceText(doc);
    if (!sourceText) {
      logger.warn(`No source text found for document ${doc.id}`);
      return;
    }

    // 2. Generate chunks
    const chunks = await this.generateChunks(sourceText);

    // 3. Prepare base metadata (extra fields)
    const fields = this.config.fields
      ? await mapPayloadDocumentToIndex(doc, this.config.fields)
      : {};

    // Add standard fields
    fields.slug = doc.slug || "";
    fields.publishedAt = doc.publishedAt
      ? new Date(doc.publishedAt).getTime()
      : undefined;

    // 4. Delete old chunks (if update)
    if (operation === "update") {
      await this.adapter.deleteDocumentsByFilter(this.tableName, {
        parent_doc_id: String(doc.id),
      });
    }

    // 5. Process and insert chunks
    const chunkDocs = [];
    for (const chunk of chunks) {
      const headers = buildHeaderHierarchy(chunk.metadata);
      let formattedText = formatChunkWithHeaders(chunk.text, headers);

      // Apply interceptResult if configured
      if (this.config.embedding?.chunking?.interceptResult) {
        formattedText = this.config.embedding.chunking.interceptResult(
          {
            ...chunk,
            headers,
            formattedText,
          },
          doc,
        );
      }

      let embedding: number[] = [];
      if (this.embeddingService) {
        const result = await this.embeddingService.getEmbedding(formattedText);
        if (result) {
          embedding = result;
        } else {
          logger.warn("Embedding generation failed for chunk", {
            documentId: doc.id,
            collection: this.collectionSlug,
            chunkIndex: chunk.index,
            textLength: formattedText.length,
            textPreview:
              formattedText.substring(0, 200) +
              (formattedText.length > 200 ? "..." : ""),
          });
        }
      }

      const chunkDoc = {
        id: `${doc.id}_chunk_${chunk.index}`,
        parent_doc_id: String(doc.id),
        chunk_index: chunk.index,
        chunk_text: formattedText,
        is_chunk: true,
        headers: headers,
        embedding: embedding,
        createdAt: new Date(doc.createdAt).getTime(),
        updatedAt: new Date(doc.updatedAt).getTime(),
        ...fields,
      };

      chunkDocs.push(chunkDoc);
    }

    // Upsert all chunks using adapter
    if (chunkDocs.length > 0) {
      await this.adapter.upsertDocuments(
        this.tableName,
        chunkDocs as IndexDocument[],
      );
    }

    logger.info(
      `Synced ${chunks.length} chunks for document ${doc.id} to ${this.tableName}`,
    );
  }

  /**
   * Extract and transform source fields for embedding generation
   */
  private async extractSourceText(doc: PayloadDocument): Promise<string> {
    if (!this.config.embedding?.fields) return "";

    const textParts: string[] = [];

    for (const sourceField of this.config.embedding.fields) {
      let fieldName: string;
      let transform: ((value: any) => any | Promise<any>) | undefined;

      if (typeof sourceField === "string") {
        fieldName = sourceField;
      } else {
        fieldName = sourceField.field;
        transform = sourceField.transform;
      }

      let val = doc[fieldName];

      // Apply transform if provided
      if (transform) {
        val = await transform(val);
      } else if (typeof val === "object" && val !== null && "root" in val) {
        // Default handling for RichText if no transform
        val = JSON.stringify(val);
      }

      textParts.push(String(val || ""));
    }

    return textParts.join("\n\n");
  }

  private async generateChunks(text: string) {
    if (!this.config.embedding?.chunking) return [];

    const { strategy, size, overlap } = this.config.embedding.chunking;
    const options = { maxChunkSize: size, overlap };

    if (strategy === "markdown") {
      return await chunkMarkdown(text, options);
    } else {
      return await chunkText(text, options);
    }
  }
}
