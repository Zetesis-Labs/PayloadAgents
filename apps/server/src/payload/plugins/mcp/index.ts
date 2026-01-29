import { mcpPlugin as _mcpPlugin } from "@payloadcms/plugin-mcp";

export const mcpPlugin = _mcpPlugin({
  collections: {
    pages: {
      enabled: true,
    },
    taxonomy: {
      enabled: true,
    },
  },
});
