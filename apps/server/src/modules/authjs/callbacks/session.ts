/**
 * Session callback - Gestiona la sesión y el id_token para logout
 */

import type { Session, User } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import { getPayload } from '../../get-payload'
import { SESSION_STRATEGY } from '../constants'
import { getIdToken, saveIdToken } from '../utils/save-id-token'

interface SessionCallbackParams {
  session: Session
  token: JWT
  user: User
}

interface SessionWithIdToken extends Session {
  id_token?: string
}

export async function sessionCallback({ session, token, user }: SessionCallbackParams): Promise<SessionWithIdToken> {
  const sessionWithToken = session as SessionWithIdToken
  // Database strategy
  if (user?.id) {
    try {
      const payload = await getPayload()

      // Intentar obtener id_token de la BD
      const storedIdToken = await getIdToken(payload, user.id)

      if (storedIdToken) {
        sessionWithToken.id_token = storedIdToken
      } else if (token?.id_token) {
        // Si no existe en BD pero está en token, guardarlo (primer login)
        const saved = await saveIdToken(payload, user.id, token.id_token as string)
        if (saved) {
          sessionWithToken.id_token = token.id_token as string
        }
      }
    } catch (error) {
      console.error('[Auth] Error in session callback:', error)
    }
  }

  return sessionWithToken
}
