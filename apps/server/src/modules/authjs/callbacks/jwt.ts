/**
 * JWT callback - Maneja el token JWT y guarda el id_token
 */

import type { Account } from 'next-auth'
import type { JWT } from 'next-auth/jwt'

interface JWTCallbackParams {
  token: JWT
  account?: Account | null
}

export async function jwtCallback({ token, account }: JWTCallbackParams): Promise<JWT> {
  // Guardar id_token en el token para usarlo después
  if (account?.id_token) {
    token.id_token = account.id_token
  }

  return token
}
