
import type { Endpoint } from "payload";
import { APIError } from "payload";
import type { PayloadDocument } from "@nexo-labs/payload-indexer";
import { syncDocumentToIndex } from "@nexo-labs/payload-indexer";
import { createTypesenseAdapter } from "@nexo-labs/payload-typesense";
import { typesenseConnection } from "@/payload/plugins/typesense/config";
import { getTableConfig } from "@/payload/plugins/typesense/collections";
import { isSuperAdmin } from "@/access/isSuperAdmin";
import type { Post } from "@/payload-types";

/**
 * Convert Payload Post document to indexable format
 * Handles the id type conversion (number -> string) and null values
 */
const toIndexableDocument = (doc: Post): PayloadDocument => ({
  ...doc,
  id: String(doc.id),
  slug: doc.slug ?? undefined,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

/**
 * Endpoint to manually sync all Posts to Typesense
 * POST /api/posts/sync-to-typesense
 */
export const syncToTypesense: Endpoint = {
  handler: async (req) => {
    // Check authentication
    if (!req.user) {
      throw new APIError("Unauthorized", 401, null, true);
    }

    // Check permissions - only superadmins can trigger full sync
    if (!isSuperAdmin(req.user)) {
      throw new APIError("Forbidden - superadmin access required", 403, null, true);
    }

    try {
      const adapter = createTypesenseAdapter(typesenseConnection);
      const tableConfig = getTableConfig("posts");

      if (!tableConfig) {
        throw new APIError("Posts collection is not configured for indexing", 500, null, true);
      }

      // Get all posts with tenant populated
      const posts = await req.payload.find({
        collection: "posts",
        limit: 0, // Get all
        depth: 1, // Populate tenant relationship
      });

      const results = {
        synced: [] as string[],
        errors: [] as string[],
      };

      console.log(`[Typesense Sync] Starting sync of ${posts.totalDocs} posts...`);

      // Sync each document
      for (const doc of posts.docs) {
        try {
          const indexableDoc = toIndexableDocument(doc);
          await syncDocumentToIndex(
            adapter,
            "posts",
            indexableDoc,
            "update",
            tableConfig
          );
          results.synced.push(String(doc.id));
          console.log(`[Typesense Sync] Synced post ${doc.id}: ${doc.title}`);
        } catch (error) {
          const errorMsg = `${doc.id}: ${error instanceof Error ? error.message : "Unknown error"}`;
          results.errors.push(errorMsg);
          console.error(`[Typesense Sync] Error syncing post ${doc.id}:`, error);
        }
      }

      console.log(`[Typesense Sync] Completed: ${results.synced.length} synced, ${results.errors.length} errors`);

      return Response.json({
        success: true,
        message: "Sync completed",
        totalDocuments: posts.totalDocs,
        results,
      });
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      console.error("[Typesense Sync] Fatal error:", error);
      throw new APIError(
        `Failed to sync to Typesense: ${error instanceof Error ? error.message : "Unknown error"}`,
        500,
        null,
        true
      );
    }
  },
  method: "post",
  path: "/sync-to-typesense",
};
