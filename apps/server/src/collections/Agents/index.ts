import type { CollectionConfig, CollectionSlug } from 'payload'
import { slugField } from 'payload'
import { COLLECTION_SLUG_TAXONOMY } from '@nexo-labs/payload-taxonomies'
import { importAgents } from './endpoints/importAgents'
import { importAgentData } from './endpoints/importAgentData'

export const Agents: CollectionConfig = {
  slug: 'agents',
  admin: {
    useAsTitle: 'name',
    group: 'RAG',
    defaultColumns: ['name', 'slug', 'llmModel', 'isActive'],
    components: {
      views: {
        list: {
          actions: ['@/modules/payload-admin/import-agents-button'],
        },
      },
    },
  },
  endpoints: [importAgents, importAgentData],
  fields: [
    // UI field for import button - appears at the top of the edit form
    {
      name: 'importDataButton',
      type: 'ui',
      admin: {
        components: {
          Field: '@/modules/payload-admin/import-agent-data-button',
        },
      },
    },
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
              admin: {
                description: 'Display name for the agent',
              },
            },
            slugField(),
            {
              name: 'isActive',
              type: 'checkbox',
              defaultValue: true,
              admin: {
                description: 'Enable or disable this agent',
              },
            },
          ],
        },
        {
          label: 'LLM Configuration',
          fields: [
            {
              name: 'llmModel',
              type: 'text',
              required: true,
              defaultValue: 'google/gemini-2.0-flash',
              admin: {
                description: 'LLM model to use (e.g., google/gemini-2.0-flash, openai/gpt-4o-mini)',
              },
            },
            {
              name: 'systemPrompt',
              type: 'textarea',
              required: true,
              admin: {
                description: 'System prompt that defines the agent personality and constraints',
              },
            },
          ],
        },
        {
          label: 'RAG Configuration',
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'searchCollections',
                  type: 'select',
                  hasMany: true,
                  defaultValue: ['pages_chunk'],
                  options: [
                    { label: 'Páginas', value: 'pages_chunk' },
                  ],
                  admin: {
                    description: 'Colecciones donde buscar contexto para RAG',
                  },
                },
                {
                  name: 'taxonomies',
                  type: 'relationship',
                  relationTo: COLLECTION_SLUG_TAXONOMY,
                  hasMany: true,
                  admin: {
                    description: 'Taxonomies that filter the RAG content. If empty, searches all content.',
                  },
                },
              ],
            },
            {
              name: 'kResults',
              type: 'number',
              defaultValue: 5,
              admin: {
                description: 'Number of chunks to retrieve for RAG context',
              },
            },
            {
              name: 'maxContextBytes',
              type: 'number',
              defaultValue: 65536,
              admin: {
                description: 'Maximum context size in bytes (default: 64KB)',
              },
            },
            {
              name: 'ttl',
              type: 'number',
              defaultValue: 86400,
              admin: {
                description: 'TTL for conversation history in seconds (default: 24h)',
              },
            },
          ],
        },
        {
          label: 'UI Configuration',
          fields: [
            {
              name: 'avatar',
              type: 'upload',
              relationTo: 'media',
              admin: {
                description: 'Avatar image for the agent',
              },
            },
            {
              name: 'welcomeTitle',
              type: 'text',
              admin: {
                description: 'Welcome message title displayed when starting a new chat',
              },
            },
            {
              name: 'welcomeSubtitle',
              type: 'text',
              admin: {
                description: 'Welcome message subtitle displayed when starting a new chat',
              },
            },
            {
              name: 'suggestedQuestions',
              type: 'array',
              admin: {
                description: 'Suggested questions displayed to help users get started',
              },
              fields: [
                {
                  name: 'prompt',
                  type: 'text',
                  required: true,
                  admin: {
                    description: 'The full prompt text to send when clicked',
                  },
                },
                {
                  name: 'title',
                  type: 'text',
                  required: true,
                  admin: {
                    description: 'Short title for the suggestion',
                  },
                },
                {
                  name: 'description',
                  type: 'text',
                  admin: {
                    description: 'Brief description of what the question is about',
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}
