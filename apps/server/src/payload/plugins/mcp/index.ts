import { mcpPlugin as _mcpPlugin } from "@payloadcms/plugin-mcp";

export const mcpPlugin = _mcpPlugin({
  collections: {
    posts: {
      enabled: true,
    },
    books: {
      enabled: true,
    },
    taxonomy: {
      enabled: true,
    },
  },
});
