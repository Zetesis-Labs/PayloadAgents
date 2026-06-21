/**
 * MCP descriptor — the read-side analog of IndexerAdapter.
 *
 * It declares how a search backend exposes itself as an MCP server, so the app
 * can (a) auto-register that MCP in a gateway (e.g. LiteLLM) and (b) render the
 * backend's tunable retrieval options per agent. Backends (payload-typesense,
 * payload-pgvector, ...) each export a descriptor; the app supplies the
 * deployment-specific URL.
 */

/** A tunable retrieval option: agent-configurable and sent to the MCP as a header. */
export interface McpRetrievalOption {
  /** Stable key — also used as the agent-config field name. */
  key: string
  /** HTTP header this option is sent as to the MCP (e.g. `x-hybrid-alpha`). */
  header: string
  /** Value/UI type. */
  type: 'text' | 'number' | 'boolean' | 'stringList'
  label: string
  description?: string
  defaultValue?: string | number | boolean | string[]
}

export interface McpDescriptor {
  /** Stable id used to register the server in an MCP gateway (e.g. `typesense-search`). */
  id: string
  displayName: string
  /** Reachable MCP endpoint (streamable HTTP), supplied by the app/deployment. */
  url: string
  /** Transport the MCP speaks. */
  transport: 'http' | 'sse'
  /**
   * Headers the gateway must forward from the agent request to this MCP
   * (LiteLLM `extra_headers`). Superset of the option headers plus any context
   * headers (tenant, retrieval-profile catalog, ...) the MCP consumes.
   */
  forwardHeaders: string[]
  /** Tunable options exposed to agents; each maps to one forwarded header. */
  retrievalOptions: McpRetrievalOption[]
}
