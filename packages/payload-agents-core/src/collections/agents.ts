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
import { createModelCatalogValidateHook } from './hooks/validate-model'

export function createAgentsCollection(config: ResolvedPluginConfig): CollectionConfig {
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
      afterChange: [createAfterChangeHook(config)],
      afterRead: [createDecryptAfterReadHook(config)],
      afterDelete: [createAfterDeleteHook(config)]
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
                // With a catalog there is no sensible default — the admin picks
                // a preset; without one, keep the historical free-form default.
                defaultValue: config.modelCatalog ? undefined : 'openai/gpt-4o',
                admin: config.modelCatalog
                  ? {
                      description: 'Model preset from the gateway catalog',
                      components: {
                        Field: {
                          path: '@zetesis/payload-agents-core/client#ModelSelectField',
                          clientProps: { catalogPath: `/api${config.basePath}/models` }
                        }
                      }
                    }
                  : {
                      description: 'LLM model to use (e.g., openai/gpt-4o, anthropic/claude-sonnet-4-20250514)'
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
