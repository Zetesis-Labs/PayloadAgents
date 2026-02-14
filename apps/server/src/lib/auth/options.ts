/**
 * Better-auth configuration for Payload CMS
 * Replaces the old authjs module with better-auth + payload-auth
 */

import { nextCookies } from 'better-auth/next-js'
import { genericOAuth, username } from 'better-auth/plugins'
import type { PayloadAuthOptions } from 'payload-auth/better-auth'
import { processOAuthSignIn, setPendingOAuthData } from '@/modules/keycloak/hooks/on-oauth-sign-in'

// Keycloak URLs (public for browser redirects, internal for server-to-server)
const KEYCLOAK_PUBLIC_URL = process.env.NEXT_PUBLIC_LOCAL_KEYCLOAK_URL
const KEYCLOAK_INTERNAL_URL = process.env.NEXT_CONTAINER_KEYCLOAK_ENDPOINT
const REALM = process.env.NEXT_PUBLIC_KC_REALM
const KEYCLOAK_USERINFO_URL = `${KEYCLOAK_INTERNAL_URL}/realms/${REALM}/protocol/openid-connect/userinfo`

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.')
  if (!parts[1]) throw new Error('Invalid JWT: missing payload')
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
  return JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'))
}

export const betterAuthPluginOptions: PayloadAuthOptions = {
  users: {
    slug: 'users',
    roles: ['superadmin', 'user'],
    adminRoles: ['superadmin'],
    defaultRole: 'user',
    defaultAdminRole: 'superadmin'
  },
  accounts: { slug: 'accounts' },
  sessions: { slug: 'sessions' },
  verifications: { slug: 'verifications' },

  betterAuthOptions: {
    emailAndPassword: { enabled: true },
    trustedOrigins: [process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'],
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60
      }
    },
    account: {
      accountLinking: { enabled: true }
    },
    plugins: [
      username(),
      genericOAuth({
        config: [
          {
            providerId: 'keycloak',
            clientId: process.env.AUTH_KEYCLOAK_ID!,
            clientSecret: process.env.AUTH_KEYCLOAK_SECRET!,
            authorizationUrl: `${KEYCLOAK_PUBLIC_URL}/realms/${REALM}/protocol/openid-connect/auth`,
            tokenUrl: `${KEYCLOAK_INTERNAL_URL}/realms/${REALM}/protocol/openid-connect/token`,
            userInfoUrl: KEYCLOAK_USERINFO_URL,
            scopes: ['openid', 'email', 'profile'],
            pkce: true,
            getUserInfo: async tokens => {
              let profile: Record<string, unknown> = {}

              // Decode id_token JWT to get Keycloak claims (roles, orgs, etc.)
              const idTokenString = tokens.idToken
              if (idTokenString) {
                try {
                  profile = decodeJwtPayload(idTokenString)
                } catch {
                  // id_token decode failed, continue with userinfo
                }
              }

              // Also fetch userinfo endpoint for additional claims (organizations, etc.)
              try {
                const response = await fetch(KEYCLOAK_USERINFO_URL, {
                  headers: { Authorization: `Bearer ${tokens.accessToken}` }
                })
                if (response.ok) {
                  const userInfo = await response.json()
                  profile = { ...profile, ...userInfo }
                }
              } catch {
                // userinfo fetch failed, continue with id_token data
              }

              // Store OAuth data for post-sign-in processing (role mapping, tenant sync)
              if (idTokenString && profile.email) {
                console.log('[Auth] Storing pending OAuth data for:', profile.email)
                console.log('[Auth] Profile realm_access:', profile.realm_access)
                setPendingOAuthData(profile.email as string, idTokenString, profile)
              }

              return {
                id: profile.sub as string,
                name: (profile.name || profile.preferred_username) as string,
                email: profile.email as string,
                image: profile.picture as string | undefined,
                emailVerified: (profile.email_verified as boolean) ?? false
              }
            }
          }
        ]
      }),
      nextCookies() // Must be last
    ],
    databaseHooks: {
      session: {
        create: {
          after: async (session: { id: string; userId: string }) => {
            console.log('[Auth] Session create hook triggered, sessionId:', session.id, 'userId:', session.userId)
            // After a new session is created (sign-in), process pending OAuth data.
            // The pending data was stored by getUserInfo during the OAuth flow.
            // Note: idToken is automatically saved to accounts by better-auth
            if (session.userId) {
              try {
                const { getPayload } = await import('@/modules/get-payload')
                const payload = await getPayload()
                const user = await payload.findByID({
                  collection: 'users',
                  id: session.userId
                })
                console.log('[Auth] Found user:', user?.email)
                if (user?.email) {
                  await processOAuthSignIn(session.userId, user.email)
                }
              } catch (error) {
                console.error('[Auth] Error in session create hook:', error)
              }
            }
          }
        }
      }
    }
  }
}
