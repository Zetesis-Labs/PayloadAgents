/**
 * Utility para obtener el id_token de la cuenta OAuth para logout de Keycloak
 * El id_token es guardado automáticamente por better-auth en la colección accounts
 */

import type { BasePayload } from 'payload'

/**
 * Obtiene el idToken de la cuenta OAuth del usuario para usarlo en el logout de Keycloak
 */
export async function getIdTokenForUser(payload: BasePayload, userId: string | number): Promise<string | null> {
  try {
    // Find the keycloak account for this user
    const accounts = await payload.find({
      collection: 'accounts',
      where: {
        and: [{ user: { equals: userId } }, { providerId: { equals: 'keycloak' } }]
      },
      limit: 1
    })

    const account = accounts.docs[0]
    if (account?.idToken) {
      return account.idToken
    }

    return null
  } catch (error) {
    console.error('[Auth] Error retrieving idToken from accounts:', error)
    return null
  }
}
