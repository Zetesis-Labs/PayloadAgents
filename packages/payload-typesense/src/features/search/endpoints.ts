import type { Client } from "typesense";

import type { ModularPluginConfig } from "../../core/config/types";
import {
  createCollectionsHandler,
  createSearchHandler,
} from "./endpoints/handlers";

export const createSearchEndpoints = (
  typesenseClient: Client,
  pluginOptions: ModularPluginConfig,
) => {
  return [
    {
      handler: createCollectionsHandler(pluginOptions),
      method: "get" as const,
      path: "/search/collections",
    },
    {
      handler: createSearchHandler(typesenseClient, pluginOptions),
      method: "get" as const,
      path: "/search/:collectionName",
    },
    {
      handler: createSearchHandler(typesenseClient, pluginOptions),
      method: "get" as const,
      path: "/search",
    },
  ];
};
