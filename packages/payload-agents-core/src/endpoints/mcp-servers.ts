/**
 * GET {basePath}/mcp-servers — MCP servers registered in the LiteLLM gateway.
 *
 * Proxies the gateway's /v1/mcp/server (server-side, master key) so the agent
 * admin can pick from EVERY exposed MCP — both the Payload-managed backends and
 * any MCP an admin added directly in LiteLLM. Requires an authenticated user.
 */

import type { PayloadHandler } from 'payload'
import { LiteLlmAdminClient, type LiteLlmMcpServer } from '../lib/litellm-admin'
import type { ResolvedPluginConfig } from '../types'

type McpServerRow = LiteLlmMcpServer & { server_name?: string; description?: string }

export function createMcpServersListHandler(config: ResolvedPluginConfig): PayloadHandler {
  return async req => {
    if (!req.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { gatewayUrl, masterKey } = config.modelCatalog
    const client = new LiteLlmAdminClient({ gatewayUrl, masterKey })
    try {
      const servers = (await client.listMcpServers()) as McpServerRow[]
      const list = servers
        .filter(s => typeof s.alias === 'string' && s.alias)
        .map(s => ({
          alias: s.alias as string,
          label: s.description || s.server_name || (s.alias as string),
          source: s.mcp_info?.source === 'payload' ? 'payload' : 'admin'
        }))
      return Response.json({ servers: list })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'mcp servers unavailable'
      return Response.json({ error: message }, { status: 503 })
    }
  }
}
