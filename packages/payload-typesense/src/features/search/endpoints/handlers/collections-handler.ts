import type { PayloadHandler } from "payload";
import { ModularPluginConfig } from "../../../..";

/**
 * Creates a handler for listing available search collections
 */
export const createCollectionsHandler = (
  pluginOptions: ModularPluginConfig,
): PayloadHandler => {
  return () => {
    try {
      // Flatten table configs to collections list
      const collections: Array<Record<string, unknown>> = [];
      for (const [slug, tableConfigs] of Object.entries(
        pluginOptions.collections || {},
      )) {
        if (Array.isArray(tableConfigs)) {
          // Get first enabled config for collection metadata
          const firstEnabledConfig = tableConfigs.find(
            (config) => config.enabled,
          );
          if (firstEnabledConfig) {
            // Extract fields based on mode
            let fields: { name: string; facet?: boolean; index?: boolean }[] =
              [];
            fields = firstEnabledConfig.fields;
            const facetFields = fields
              .filter((f) => f.facet)
              .map((f) => f.name);
            const searchFields = fields
              .filter((f) => f.index !== false)
              .map((f) => f.name); // Default to index true unless explicitly false? Or explicit index?
            // In our new config, index is optional, defaulting to... ?
            // Let's assume if it's in the fields list, it's relevant.
            // Actually, we should check 'index' property if we want to be precise.
            // But for now, let's just map all fields as search fields if they are not facets only?
            // The UI probably needs to know what to search.

            collections.push({
              slug,
              displayName:
                firstEnabledConfig.displayName ||
                slug.charAt(0).toUpperCase() + slug.slice(1),
              facetFields,
              searchFields,
            });
          }
        }
      }

      return Response.json({
        categorized: false, // Categorized setting moved or removed
        collections,
      });
    } catch (_error) {
      // Handle collections error
      return Response.json(
        { error: "Failed to get collections" },
        { status: 500 },
      );
    }
  };
};
