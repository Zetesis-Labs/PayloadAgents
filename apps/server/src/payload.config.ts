import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { agentPlugin } from '@zetesis/payload-agents-core'
import { metricsPlugin } from '@zetesis/payload-agents-metrics'
import { createDocumentsPlugin } from '@zetesis/payload-documents'
import type { McpDescriptor } from '@zetesis/payload-indexer'
import { createPgvectorMcpDescriptor } from '@zetesis/payload-pgvector'
import { createTypesenseMcpDescriptor } from '@zetesis/payload-typesense'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import type { Payload } from 'payload'
import { buildConfig } from 'payload'
import { Media } from './collections/Media'
import { McpSearchTokens } from './collections/McpSearchTokens'
import { Posts } from './collections/Posts'
import { Taxonomies } from './collections/Taxonomies'
import { Users } from './collections/Users'
import { defaultLocale, locales } from './i18n/locales'
import { pgvectorPlugin } from './plugins/pgvector'
import { typesensePlugin } from './plugins/typesense'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

/** Default daily token limit for all users (500k tokens). */
async function getDailyLimit(_payload: Payload, _userId: string | number): Promise<number> {
  return 500_000_000
}

/**
 * pgvector is an EXPERIMENTAL second backend, opt-in via ENABLE_PGVECTOR=true.
 * When enabled it indexes in parallel with Typesense (a synchronous dual-write —
 * see plugins/pgvector) and exposes its own MCP for A/B comparison. Off by
 * default so the speculative probe never couples content saves to a second engine.
 */
const PGVECTOR_ENABLED = process.env.ENABLE_PGVECTOR === 'true'

/**
 * MCP descriptors for the configured search backends. The app supplies the
 * deployment URLs; agentPlugin registers them in LiteLLM on boot so agents can
 * select them.
 */
const mcpDescriptors: McpDescriptor[] = [
  createTypesenseMcpDescriptor({ url: process.env.MCP_TYPESENSE_URL || 'http://app:3030/mcp' }),
  ...(PGVECTOR_ENABLED
    ? [createPgvectorMcpDescriptor({ url: process.env.MCP_PGVECTOR_URL || 'http://app:3041/mcp' })]
    : [])
]
const mcpServers = mcpDescriptors.map(descriptor => ({
  alias: descriptor.id,
  serverName: descriptor.id,
  description: descriptor.displayName,
  transport: descriptor.transport,
  url: descriptor.url,
  extraHeaders: descriptor.forwardHeaders,
  allowAllKeys: true
}))

export default buildConfig({
  folders: {},
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname)
    },
    components: {
      beforeDashboard: ['/views/LlmUsageView#default']
    }
  },
  localization: {
    locales: [...locales],
    defaultLocale
  },
  collections: [Users, Media, Posts, Taxonomies, McpSearchTokens],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || 'CHANGE_ME',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts')
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || ''
    }
  }),
  graphQL: {
    schemaOutputFile: path.resolve(dirname, 'generated-schema.graphql')
  },
  plugins: (() => {
    const metrics = metricsPlugin({ multiTenant: false, basePath: '/metrics' })
    return [
      typesensePlugin,
      ...(PGVECTOR_ENABLED ? [pgvectorPlugin] : []),
      agentPlugin({
        runtimeUrl: process.env.AGENT_RUNTIME_URL || 'http://localhost:8000',
        runtimeSecret: process.env.INTERNAL_SECRET,
        // Curated model catalog served by the LiteLLM gateway (hard dependency):
        // llmModel is a preset select in admin, writes are validated against the
        // catalog, and Payload mints one virtual key per agent.
        modelCatalog: {
          gatewayUrl: process.env.LITELLM_GATEWAY_URL || 'http://litellm:4000',
          masterKey: process.env.LITELLM_MASTER_KEY
        },
        mcpServers,
        // Tag managed MCP servers by environment so a shared LiteLLM across
        // deployments doesn't prune across them (prune defaults on, scoped here).
        mcpServerSync: { environment: process.env.MCP_MANAGED_ENV },
        getDailyLimit,
        encryptionKey: process.env.PAYLOAD_SECRET,
        basePath: '/chat',
        mediaCollectionSlug: 'media',
        taxonomyCollectionSlug: 'taxonomy',
        searchCollectionOptions: [{ label: 'Posts', value: 'posts_chunk' }],
        onRunCompleted: metrics.onRunCompleted
      }),
      metrics,
      // Documents plugin: ships the `documents` upload collection + the
      // LlamaParse parse pipeline. Worker mode is opt-in via PAYLOAD_WORKER_URL
      // (mirrors the ZetesisPortal wiring). The standalone test app stores
      // uploads on local fs (Payload's default `staticDir: <slug>`), so the
      // file resolver reads straight from disk instead of going through S3.
      createDocumentsPlugin({
        worker: process.env.PAYLOAD_WORKER_URL
          ? {
              url: process.env.PAYLOAD_WORKER_URL,
              internalSecret: process.env.INTERNAL_SECRET ?? '',
              resolveFileBinary: async ({ doc }) => {
                const filename = typeof doc.filename === 'string' ? doc.filename : null
                if (!filename) {
                  throw new Error(`Document ${String(doc.id)} has no filename`)
                }
                // Payload's default upload dir for an `upload` collection is
                // `<cwd>/<staticDir>` and the plugin sets `staticDir = slug`,
                // so files for the `documents` collection live under
                // `<server-cwd>/documents/<filename>`.
                const filepath = path.resolve(process.cwd(), 'documents', filename)
                const buffer = await readFile(filepath)
                return {
                  body: buffer,
                  contentType: typeof doc.mimeType === 'string' ? doc.mimeType : undefined,
                  contentLength: buffer.byteLength
                }
              }
            }
          : undefined
      }).plugin
    ]
  })()
})
