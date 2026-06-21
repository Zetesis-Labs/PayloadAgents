/**
 * Agents collection definition.
 *
 * Registers the `agents` collection (or custom slug) with fields for
 * LLM config, RAG config, and UI config. Hooks are injected by the plugin
 * based on the resolved config.
 */

import type { CollectionConfig } from 'payload'
import type { ResolvedPluginConfig } from '../types'
import { createDecryptAfterReadHook, createEncryptBeforeChangeHook } from './hooks/encrypt-api-key'
import { createAfterChangeHook, createAfterDeleteHook } from './hooks/reload-runtime'
import {
  createLiteLlmVirtualKeySyncAfterChangeHook,
  createLiteLlmVirtualKeySyncAfterDeleteHook,
  createLiteLlmVirtualKeySyncBeforeDeleteHook
} from './hooks/sync-litellm-virtual-key'
import { createModelCatalogValidateHook } from './hooks/validate-model'

export function createAgentsCollection(config: ResolvedPluginConfig): CollectionConfig {
  // Options for the agent's MCP-server multi-select, derived from the MCP
  // servers registered in the gateway (so the picker lists exactly what exists).
  const mcpServerOptions = config.mcpServers.map(server => ({
    label: server.description ?? server.alias,
    value: server.alias
  }))

  const base: CollectionConfig = {
    slug: config.collectionSlug,
    access: {
      read: () => true,
      create: ({ req: { user } }) => Boolean(user),
      update: ({ req: { user } }) => Boolean(user),
      delete: ({ req: { user } }) => Boolean(user)
    },
    hooks: {
      beforeValidate: [createModelCatalogValidateHook(config)],
      beforeChange: [createEncryptBeforeChangeHook(config)],
      beforeDelete: [createLiteLlmVirtualKeySyncBeforeDeleteHook(config)],
      afterChange: [createLiteLlmVirtualKeySyncAfterChangeHook(config), createAfterChangeHook(config)],
      afterRead: [createDecryptAfterReadHook(config)],
      afterDelete: [createLiteLlmVirtualKeySyncAfterDeleteHook(), createAfterDeleteHook(config)]
    },
    admin: {
      useAsTitle: 'name',
      group: 'Chat',
      defaultColumns: ['name', 'slug', 'llmModel', 'isActive']
    },
    fields: [
      {
        type: 'tabs',
        tabs: [
          {
            label: 'General',
            fields: [
              {
                name: 'name',
                type: 'text',
                required: true,
                admin: { description: 'Display name for the agent' }
              },
              {
                name: 'slug',
                type: 'text',
                required: true,
                unique: true,
                admin: { description: 'URL-friendly identifier' }
              },
              {
                name: 'isActive',
                type: 'checkbox',
                defaultValue: true,
                admin: { description: 'Enable or disable this agent' }
              },
              {
                name: 'allowGuestAccess',
                type: 'checkbox',
                defaultValue: false,
                admin: {
                  description:
                    'When enabled, anonymous channel callers (e.g. Telegram users not yet bound to a ZP user) can chat with this agent. Leave off to require a bound user.'
                }
              }
            ]
          },
          {
            label: 'LLM Configuration',
            fields: [
              {
                name: 'llmModel',
                type: 'text',
                required: true,
                // The admin picks a preset from the gateway catalog.
                admin: {
                  description: 'Model preset from the gateway catalog',
                  components: {
                    Field: {
                      path: '@zetesis/payload-agents-core/client#ModelSelectField',
                      clientProps: { catalogPath: `/api${config.basePath}/models` }
                    }
                  }
                }
              },
              {
                name: 'apiKey',
                type: 'text',
                required: true,
                admin: {
                  description: config.encryptionKey
                    ? 'API Key for the LLM provider (encrypted at rest)'
                    : 'API Key for the LLM provider'
                }
              },
              {
                name: 'apiKeyFingerprint',
                type: 'text',
                admin: {
                  readOnly: true,
                  description: 'Last 4 characters of the API key (auto-computed)'
                }
              },
              {
                name: 'systemPrompt',
                type: 'textarea',
                required: true,
                admin: { description: 'System prompt that defines the agent personality and constraints' }
              },
              {
                name: 'toolCallLimit',
                type: 'number',
                admin: { description: 'Max tool calls per turn. Leave empty for no limit.' }
              },
              {
                name: 'mcpServers',
                type: 'select',
                hasMany: true,
                options: mcpServerOptions,
                admin: {
                  description:
                    'Search backends (MCP servers) this agent can use, routed through the LiteLLM gateway. Empty = none.'
                }
              },
              {
                type: 'row',
                fields: [
                  {
                    name: 'maxBudgetUsd',
                    type: 'number',
                    min: 0,
                    admin: { description: 'Optional LiteLLM max budget for this agent virtual key, in USD.' }
                  },
                  {
                    name: 'budgetDuration',
                    type: 'text',
                    admin: { description: 'Optional LiteLLM budget reset window, e.g. 1d, 30d, 1mo.' }
                  }
                ]
              },
              {
                type: 'row',
                fields: [
                  {
                    name: 'rpmLimit',
                    type: 'number',
                    min: 0,
                    admin: { description: 'Optional LiteLLM requests-per-minute limit for this agent.' }
                  },
                  {
                    name: 'tpmLimit',
                    type: 'number',
                    min: 0,
                    admin: { description: 'Optional LiteLLM tokens-per-minute limit for this agent.' }
                  }
                ]
              },
              {
                type: 'collapsible',
                label: 'LiteLLM Virtual Key',
                admin: { initCollapsed: true },
                fields: [
                  {
                    name: 'litellmVirtualKey',
                    type: 'text',
                    admin: { hidden: true }
                  },
                  {
                    name: 'litellmVirtualKeyAlias',
                    type: 'text',
                    admin: { readOnly: true, description: 'LiteLLM key alias managed by Payload.' }
                  },
                  {
                    name: 'litellmVirtualKeyFingerprint',
                    type: 'text',
                    admin: { readOnly: true, description: 'Last 4 characters of the LiteLLM virtual key.' }
                  },
                  {
                    name: 'litellmVirtualKeySyncStatus',
                    type: 'select',
                    admin: { readOnly: true, description: 'Last LiteLLM virtual key sync status.' },
                    options: [
                      { label: 'Pending', value: 'pending' },
                      { label: 'Synced', value: 'synced' },
                      { label: 'Blocked', value: 'blocked' },
                      { label: 'Disabled', value: 'disabled' },
                      { label: 'Error', value: 'error' }
                    ]
                  },
                  {
                    name: 'litellmVirtualKeySyncedAt',
                    type: 'date',
                    admin: { readOnly: true, description: 'Last successful LiteLLM virtual key sync.' }
                  },
                  {
                    name: 'litellmVirtualKeySyncError',
                    type: 'textarea',
                    admin: { readOnly: true, description: 'Last LiteLLM virtual key sync error, if any.' }
                  }
                ]
              }
            ]
          },
          {
            label: 'UI Configuration',
            fields: [
              {
                name: 'avatar',
                type: 'upload',
                relationTo: config.mediaCollectionSlug,
                admin: { description: 'Avatar image for the agent' }
              },
              {
                name: 'welcomeTitle',
                type: 'text',
                admin: { description: 'Welcome message title displayed when starting a new chat' }
              },
              {
                name: 'welcomeSubtitle',
                type: 'text',
                admin: { description: 'Welcome message subtitle displayed when starting a new chat' }
              },
              {
                name: 'suggestedQuestions',
                type: 'array',
                admin: { description: 'Suggested questions to help users get started' },
                fields: [
                  {
                    name: 'prompt',
                    type: 'text',
                    required: true,
                    admin: { description: 'The full prompt text to send when clicked' }
                  },
                  {
                    name: 'title',
                    type: 'text',
                    required: true,
                    admin: { description: 'Short title for the suggestion' }
                  },
                  {
                    name: 'description',
                    type: 'text',
                    admin: { description: 'Brief description of what the question is about' }
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }

  return config.collectionOverrides ? config.collectionOverrides(base) : base
}
