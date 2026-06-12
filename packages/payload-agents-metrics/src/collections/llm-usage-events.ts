import type { CollectionConfig, Field } from 'payload'
import type { ResolvedMetricsConfig } from '../types'

export function createLlmUsageEventsCollection(config: ResolvedMetricsConfig): CollectionConfig {
  const defaultColumns = config.multiTenant
    ? ['completedAt', 'tenant', 'user', 'agentSlug', 'model', 'totalTokens', 'costUsd']
    : ['completedAt', 'user', 'agentSlug', 'model', 'totalTokens', 'costUsd']

  const fields: Field[] = [
    // ── Relationships ───────────────────────────────────────────────
    // Note: when `multiTenant: true`, the consumer's `@payloadcms/plugin-multi-tenant`
    // injects the `tenant` relationship automatically — do NOT add it here or it collides.
    {
      name: 'user',
      type: 'relationship',
      relationTo: config.usersSlug,
      required: true,
      index: true,
      admin: { description: 'User who triggered the run' }
    },
    {
      name: 'agent',
      type: 'relationship',
      relationTo: config.agentsSlug,
      index: true,
      admin: { description: 'Agent FK (may be null if agent was deleted)' }
    },
    {
      name: 'agentSlug',
      type: 'text',
      index: true,
      admin: { description: 'Persisted independently so records survive agent deletion' }
    },
    // ── Session / run ───────────────────────────────────────────────
    {
      name: 'conversationId',
      type: 'text',
      index: true,
      admin: { description: 'Agno session_id — groups messages into a conversation' }
    },
    { name: 'runId', type: 'text', admin: { description: 'Agno run_id — unique per event' } },
    // ── Model / provider ────────────────────────────────────────────
    {
      name: 'provider',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: 'Anthropic', value: 'anthropic' },
        { label: 'OpenAI', value: 'openai' },
        { label: 'Google', value: 'google' }
      ]
    },
    { name: 'model', type: 'text', required: true, index: true },
    {
      name: 'apiKeySource',
      type: 'select',
      required: true,
      defaultValue: 'agent',
      index: true,
      options: [
        { label: 'Agent (platform key)', value: 'agent' },
        { label: 'User (BYOK)', value: 'user' }
      ]
    },
    {
      name: 'apiKeyFingerprint',
      type: 'text',
      admin: { description: 'Last 4 chars of the API key used. Never store the raw key.' }
    },
    // ── Token accounting ────────────────────────────────────────────
    { name: 'inputTokens', type: 'number', required: true, defaultValue: 0 },
    { name: 'outputTokens', type: 'number', required: true, defaultValue: 0 },
    { name: 'cachedInputTokens', type: 'number', defaultValue: 0 },
    { name: 'totalTokens', type: 'number', required: true, defaultValue: 0 },
    { name: 'costUsd', type: 'number', required: true, defaultValue: 0 },
    {
      name: 'costSource',
      type: 'select',
      defaultValue: 'table',
      index: true,
      options: [
        { label: 'Gateway (real)', value: 'gateway' },
        { label: 'Pricing table (estimated)', value: 'table' }
      ],
      admin: {
        description: "Whether costUsd is the LiteLLM gateway's real figure or the static table estimate"
      }
    },
    // ── Execution ───────────────────────────────────────────────────
    { name: 'startedAt', type: 'date', index: true },
    { name: 'completedAt', type: 'date', required: true, index: true },
    { name: 'latencyMs', type: 'number' },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'success',
      options: [
        { label: 'Success', value: 'success' },
        { label: 'Error', value: 'error' }
      ]
    },
    { name: 'errorCode', type: 'text' }
  ]

  const base: CollectionConfig = {
    slug: config.collectionSlug,
    admin: { group: 'Observability', defaultColumns },
    access: {
      read: async ({ req }) => {
        if (!req.user) return false
        const result = await config.checkAccess(req.payload, req.user)
        if (!result) return false
        if ('allTenants' in result) return true
        if (!config.multiTenant) return true
        return { tenant: { in: result.tenantIds } }
      },
      create: () => false,
      update: () => false,
      delete: () => false
    },
    fields
  }

  return config.collectionOverrides ? config.collectionOverrides(base) : base
}
