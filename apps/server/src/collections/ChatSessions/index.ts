import { CollectionConfig } from 'payload'

export type ChatSessionStatus = 'active' | 'closed'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  sources?: Array<{
    id: string
    title: string
    chunk_index: number
    slug?: string
  }>
}

export const ChatSessions: CollectionConfig = {
  slug: 'chat-sessions',
  admin: {
    group: 'Chat',
    useAsTitle: 'conversation_id',
    defaultColumns: ['conversation_id', 'user', 'status', 'total_tokens', 'last_activity'],
  },
  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'conversation_id',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        description: 'ID de conversación de Typesense',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: [
        { label: 'Activa', value: 'active' },
        { label: 'Cerrada manualmente', value: 'closed' },
      ],
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Active = en uso. Closed = cerrada por el usuario. La expiración (>24h inactiva) se calcula dinámicamente.',
      },
    },
    {
      name: 'agentSlug',
      type: 'text',
      required: false,
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Slug del agente utilizado en esta conversación',
      },
    },
    {
      name: 'messages',
      type: 'json',
      required: true,
      defaultValue: [],
      admin: {
        description:
          'Historial de mensajes en formato JSON: [{role, content, timestamp, sources}]',
      },
    },
    {
      name: 'spending',
      type: 'json',
      required: true,
      defaultValue: [],
      admin: {
        description:
          'Detalle de gastos por servicio: [{service, model, tokens, cost_usd, timestamp}]',
      },
    },
    {
      name: 'total_tokens',
      type: 'number',
      required: true,
      defaultValue: 0,
      admin: {
        position: 'sidebar',
        description: 'Total de tokens usados en esta conversación',
      },
    },
    {
      name: 'total_cost',
      type: 'number',
      required: true,
      defaultValue: 0,
      admin: {
        position: 'sidebar',
        description: 'Costo total estimado en USD',
      },
    },
    {
      name: 'last_activity',
      type: 'date',
      required: true,
      index: true,
      admin: {
        description: 'Última actividad. Se actualiza automáticamente en cada mensaje. Las sesiones con >24h de inactividad se consideran expiradas (calculado dinámicamente).',
      },
    },
    {
      name: 'closed_at',
      type: 'date',
      admin: {
        position: 'sidebar',
        description: 'Fecha de cierre manual',
      },
    },
  ],
  hooks: {
    beforeChange: [
      async ({ data, operation }) => {
        // Auto-update last_activity on create and update
        if (operation === 'create' || operation === 'update') {
          data.last_activity = new Date()
        }

        // Set closed_at when status changes to closed
        if (data.status === 'closed' && !data.closed_at) {
          data.closed_at = new Date()
        }

        return data
      },
    ],
  },
}
