/**
 * Configuración principal de AuthJS para Keycloak
 * https://ulasozdemir.com.tr/enterprise-level-authentication-in-a-containerized-environment-for-nextjs-13
 */

import keycloak from 'next-auth/providers/keycloak'
import type { EnrichedAuthConfig } from 'payload-authjs'
import { jwtCallback } from './callbacks/jwt'
import { profileCallback } from './callbacks/profile'
import { sessionCallback } from './callbacks/session'
import { signInCallback } from './callbacks/signIn'
import { SESSION_STRATEGY } from './constants'

export { SESSION_STRATEGY } from './constants'

// URLs de Keycloak
const KEYCLOAK_PUBLIC_URL = process.env.NEXT_PUBLIC_LOCAL_KEYCLOAK_URL
const KEYCLOAK_INTERNAL_URL = process.env.NEXT_CONTAINER_KEYCLOAK_ENDPOINT
const REALM = process.env.NEXT_PUBLIC_KC_REALM

export const authConfig: EnrichedAuthConfig = {
  theme: { logo: 'https://authjs.dev/img/logo-sm.png' },
  trustHost: true,
  secret: process.env.AUTH_SECRET,

  providers: [
    keycloak({
      allowDangerousEmailAccountLinking: true,
      id: 'keycloak',
      clientId: process.env.AUTH_KEYCLOAK_ID,
      clientSecret: process.env.AUTH_KEYCLOAK_SECRET,

      // URL pública para el navegador
      issuer: `${KEYCLOAK_PUBLIC_URL}/realms/${REALM}`,

      authorization: {
        params: { scope: 'openid email profile' },
        url: `${KEYCLOAK_PUBLIC_URL}/realms/${REALM}/protocol/openid-connect/auth`
      },

      // URLs internas para comunicación servidor-servidor
      token: `${KEYCLOAK_INTERNAL_URL}/realms/${REALM}/protocol/openid-connect/token`,
      userinfo: `${KEYCLOAK_INTERNAL_URL}/realms/${REALM}/protocol/openid-connect/userinfo`,
      jwks_endpoint: `${KEYCLOAK_INTERNAL_URL}/realms/${REALM}/protocol/openid-connect/certs`,
      wellKnown: undefined,

      profile: profileCallback
    })
  ],

  session: {
    strategy: SESSION_STRATEGY
  },

  callbacks: {
    signIn: signInCallback,
    jwt: jwtCallback,
    session: sessionCallback
  }
}
