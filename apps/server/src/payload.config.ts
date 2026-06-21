import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { agentPlugin } from '@zetesis/payload-agents-core'
import { metricsPlugin } from '@zetesis/payload-agents-metrics'
import { createDocumentsPlugin } from '@zetesis/payload-documents'
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
import { typesensePlugin } from './plugins/typesense'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

/** Default daily token limit for all users (500k tokens). */
async function getDailyLimit(_payload: Payload, _userId: string | number): Promise<number> {
  return 500_000_000
}

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
