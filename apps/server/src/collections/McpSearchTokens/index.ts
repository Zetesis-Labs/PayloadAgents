import type { CollectionConfig } from 'payload'
import { createAccess, deleteAccess, readAccess, updateAccess } from './access'
import {
  blockMcpTokenKeyAfterDelete,
  enforceMaxTokens,
  setUserBeforeChange,
  syncMcpTokenKeyAfterChange,
} from './hooks'

export const McpSearchTokens: CollectionConfig = {
  slug: 'mcp-search-tokens',
  access: {
    create: createAccess,
    read: readAccess,
    update: updateAccess,
    delete: deleteAccess,
  },
  hooks: {
    beforeChange: [setUserBeforeChange],
    beforeValidate: [enforceMaxTokens],
    afterChange: [syncMcpTokenKeyAfterChange],
    afterDelete: [blockMcpTokenKeyAfterDelete],
  },
  admin: {
    useAsTitle: 'label',
    defaultColumns: ['label', 'tokenPrefix', 'lastUsedAt', 'createdAt'],
  },
  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'taxonomies',
      type: 'relationship',
      relationTo: 'taxonomy',
      hasMany: true,
      admin: {
        description:
          'Optional. If set, every search made with this token is auto-scoped to these taxonomy slugs (forwarded as `x-taxonomy-slugs` to the MCP server).',
      },
    },
    {
      name: 'label',
      type: 'text',
      required: true,
      admin: { description: 'Descriptive name (e.g. "Claude Desktop").' },
    },
    {
      name: 'tokenHash',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { hidden: true },
    },
    {
      name: 'tokenPrefix',
      type: 'text',
      required: true,
      admin: { readOnly: true, description: 'First chars of the token for identification.' },
    },
    {
      name: 'mcpServer',
      type: 'select',
      required: true,
      defaultValue: 'typesense_search',
      options: [
        { label: 'Typesense', value: 'typesense_search' },
        { label: 'pgvector', value: 'pgvector_search' },
      ],
      admin: {
        description: 'Which search backend (MCP server) this token reaches, enforced via LiteLLM.',
      },
    },
    {
      name: 'lastUsedAt',
      type: 'date',
      admin: { readOnly: true, description: 'Last time this token authenticated a request.' },
    },
    {
      type: 'collapsible',
      label: 'LiteLLM Virtual Key',
      admin: { initCollapsed: true },
      fields: [
        { name: 'litellmVirtualKey', type: 'text', admin: { hidden: true } },
        {
          name: 'litellmVirtualKeyAlias',
          type: 'text',
          admin: { readOnly: true, description: 'Internal per-token key alias in LiteLLM.' },
        },
        { name: 'litellmVirtualKeyFingerprint', type: 'text', admin: { readOnly: true } },
        {
          name: 'litellmVirtualKeySyncStatus',
          type: 'select',
          admin: { readOnly: true },
          options: [
            { label: 'Synced', value: 'synced' },
            { label: 'Error', value: 'error' },
          ],
        },
        { name: 'litellmVirtualKeySyncError', type: 'textarea', admin: { readOnly: true } },
      ],
    },
  ],
}
