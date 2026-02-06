import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import { Agents } from './collections/Agents'
import { Books } from './collections/Books'
import { ChatSessions } from './collections/ChatSessions'
import { Media } from './collections/Media'
import { Posts } from './collections/Posts'
import { Taxonomies } from './collections/Taxonomies'
import { Tenants } from './collections/Tenants'
import Users from './collections/Users'
import { migrations } from './migrations'
import authJs from './modules/authjs'
import { importExportPlugin } from './payload/plugins/import-export'
import { mcpPlugin } from './payload/plugins/mcp'
import { multiTenantPlugin } from './payload/plugins/multi-tenant'
import { nestedDocsPlugin } from './payload/plugins/nested-docs'
import { typesensePlugin } from './payload/plugins/typesense'
import { seed } from './seed'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// eslint-disable-next-line no-restricted-exports
export default buildConfig({
  admin: {
    user: 'users',
    components: {
      afterDashboard: ['@/modules/payload-admin/typesense-sync-widget']
    }
  },
  serverURL: process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000',
  csrf: ['http://localhost:3000'],
  cors: ['http://localhost:3000'],
  collections: [Posts, Books, Users, Tenants, ChatSessions, Agents, Media, Taxonomies],
  db: postgresAdapter({
    push: false,
    prodMigrations: migrations,
    pool: {
      connectionString: process.env.DATABASE_URL
    }
  }),
  onInit: async args => {
    if (process.env.SEED_DB) {
      await seed(args)
    }
  },
  editor: lexicalEditor({}),
  graphQL: {
    schemaOutputFile: path.resolve(dirname, 'generated-schema.graphql')
  },
  secret: process.env.PAYLOAD_SECRET as string,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts')
  },
  plugins: [importExportPlugin, nestedDocsPlugin, mcpPlugin, multiTenantPlugin, typesensePlugin, authJs]
})
