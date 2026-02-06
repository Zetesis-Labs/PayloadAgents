/**
 * SignIn callback - Guarda el id_token en la base de datos para logout
 */

import type { Account, Profile, User } from 'next-auth'
import type { AdapterUser } from 'next-auth/adapters'
import { getPayload } from 'payload'
import payloadConfig from '@/payload.config'
import { SESSION_STRATEGY } from '../constants'

interface SignInCallbackParams {
  user: User | AdapterUser
  account?: Account | null
  profile?: Profile
  email?: { verificationRequest?: boolean }
  credentials?: Record<string, unknown>
}

export async function signInCallback({ user, account }: SignInCallbackParams): Promise<boolean> {
  // Guardar id_token a la base de datos durante el signIn
  if (account?.id_token && user?.id && SESSION_STRATEGY === 'database' && typeof window === 'undefined') {
    try {
      const payload = await getPayload({ config: payloadConfig })
      await payload.update({
        collection: 'users',
        id: user.id,
        data: {
          id_token: account.id_token
        }
      })
      console.log('[Auth] ✅ ID token saved for logout')
    } catch (error) {
      console.error('[Auth] ❌ Error saving id_token:', error)
    }
  }

  return true
}
