import type { Payload, PayloadRequest } from 'payload'
import type { ChatEndpointConfig } from '../route'

/**
 * JSON Response helper
 */
export const jsonResponse = (data: any, options?: ResponseInit) => {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
    ...options
  })
}

/**
 * Validates chat request and extracts required data
 */
export async function validateChatRequest(
  request: PayloadRequest,
  config: ChatEndpointConfig
): Promise<
  | { success: false; error: Response }
  | {
      success: true
      userId: string | number
      userEmail: string
      payload: Payload
      userMessage: string
      body: {
        message: string
        chatId?: string
        selectedDocuments?: string[]
        agentSlug?: string
      }
    }
> {
  // Check permissions
  if (!(await config.checkPermissions(request))) {
    return {
      success: false,
      error: jsonResponse({ error: 'No tienes permisos para acceder a esta sesión.' }, { status: 403 })
    }
  }

  // Validate request structure
  if (!request.url || !request.user) {
    return {
      success: false,
      error: jsonResponse({ error: 'URL not found' }, { status: 400 })
    }
  }
  const { user } = request

  const { id: userId } = user
  const userEmail = 'email' in user ? (user['email'] ?? '') : ''
  const payload = await config.getPayload()
  const body = await request.json?.()

  // Validate body exists
  if (!body) {
    return {
      success: false,
      error: jsonResponse({ error: 'Body not found' }, { status: 400 })
    }
  }

  // Validate message
  if (!body.message || typeof body.message !== 'string' || body.message.trim() === '') {
    return {
      success: false,
      error: jsonResponse({ error: 'Se requiere un mensaje.' }, { status: 400 })
    }
  }

  const userMessage = body.message.trim()

  return {
    success: true,
    userId,
    userEmail,
    payload,
    userMessage,
    body
  }
}
