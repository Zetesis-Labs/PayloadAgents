/**
 * Guarda el id_token en el usuario para usarlo en el logout de Keycloak
 */

import type { BasePayload } from 'payload'

export async function saveIdToken(payload: BasePayload, userId: string, idToken: string): Promise<boolean> {
  try {
    await payload.update({
      collection: 'users',
      id: userId,
      data: {
        id_token: idToken
      } as Record<string, unknown>
    })
    console.log('[Auth] ✅ ID token saved for logout')
    return true
  } catch (error) {
    console.error('[Auth] ❌ Error saving id_token:', error)
    return false
  }
}

export async function getIdToken(payload: BasePayload, userId: string): Promise<string | null> {
  try {
    const userRecord = await payload.findByID({
      collection: 'users',
      id: userId
    })

    return (userRecord?.id_token as string) || null
  } catch (error) {
    console.error('[Auth] Error retrieving id_token from user:', error)
    return null
  }
}
