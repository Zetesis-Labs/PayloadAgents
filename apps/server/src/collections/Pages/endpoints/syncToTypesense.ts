import type { Endpoint } from "payload";
import { APIError } from "payload";
import type { PayloadDocument } from "@nexo-labs/payload-indexer";
import { syncDocumentToIndex } from "@nexo-labs/payload-indexer";
import { createTypesenseAdapter } from "@nexo-labs/payload-typesense";
import { typesenseConnection } from "@/payload/plugins/typesense/config";
import { getTableConfig } from "@/payload/plugins/typesense/collections";
import { isSuperAdmin } from "@/access/isSuperAdmin";
import type { Page } from "@/payload-types";

/**
 * Convert Payload Page document to indexable format
 * Handles the id type conversion (number -> string) and null values
 */
const toIndexableDocument = (doc: Page): PayloadDocument => ({
  ...doc,
  id: String(doc.id),
  slug: doc.slug ?? undefined,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

/**
 * Endpoint to manually sync all Pages to Typesense
 * POST /api/pages/sync-to-typesense
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
      const tableConfig = getTableConfig("pages");

      if (!tableConfig) {
        throw new APIError("Pages collection is not configured for indexing", 500, null, true);
      }

      // Get all pages with tenant populated
      const pages = await req.payload.find({
        collection: "pages",
        limit: 0, // Get all
        depth: 1, // Populate tenant relationship
      });

      const results = {
        synced: [] as string[],
        errors: [] as string[],
      };

      console.log(`[Typesense Sync] Starting sync of ${pages.totalDocs} pages...`);

      // Sync each document
      for (const doc of pages.docs) {
        try {
          const indexableDoc = toIndexableDocument(doc);
          await syncDocumentToIndex(
            adapter,
            "pages",
            indexableDoc,
            "update",
            tableConfig
          );
          results.synced.push(String(doc.id));
          console.log(`[Typesense Sync] Synced page ${doc.id}: ${doc.title}`);
        } catch (error) {
          const errorMsg = `${doc.id}: ${error instanceof Error ? error.message : "Unknown error"}`;
          results.errors.push(errorMsg);
          console.error(`[Typesense Sync] Error syncing page ${doc.id}:`, error);
        }
      }

      console.log(`[Typesense Sync] Completed: ${results.synced.length} synced, ${results.errors.length} errors`);

      return Response.json({
        success: true,
        message: "Sync completed",
        totalDocuments: pages.totalDocs,
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
