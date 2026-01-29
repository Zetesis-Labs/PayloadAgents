import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'

import { Pages } from './collections/Pages'
import { Tenants } from './collections/Tenants'
import { ChatSessions } from './collections/ChatSessions'
import { Agents } from './collections/Agents'
import { Taxonomies } from './collections/Taxonomies'
import { Media } from './collections/Media'
import Users from './collections/Users'
import { importExportPlugin } from './payload/plugins/import-export'
import { typesensePlugin } from './payload/plugins/typesense'
import { multiTenantPlugin } from './payload/plugins/multi-tenant'
import { mcpPlugin } from './payload/plugins/mcp'
import { nestedDocsPlugin } from './payload/plugins/nested-docs'
import { seed } from './seed'
import authJs from './modules/authjs'
import { migrations } from './migrations'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// eslint-disable-next-line no-restricted-exports
export default buildConfig({
  admin: {
    user: 'users',
    components: {
      afterDashboard: ['@/modules/payload-admin/typesense-sync-widget'],
    },
  },
  collections: [Pages, Users, Tenants, ChatSessions, Agents, Media, Taxonomies],
  db: postgresAdapter({
    push: false,
    prodMigrations: migrations,
    pool: {
      connectionString: process.env.DATABASE_URL,
    },
  }),
  onInit: async (args) => {
    if (process.env.SEED_DB) {
      await seed(args)
    }
  },
  editor: lexicalEditor({}),
  graphQL: {
    schemaOutputFile: path.resolve(dirname, 'generated-schema.graphql'),
  },
  secret: process.env.PAYLOAD_SECRET as string,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  plugins: [
    importExportPlugin,
    nestedDocsPlugin,
    mcpPlugin,
    multiTenantPlugin,
    typesensePlugin,
    authJs,
  ],
})
