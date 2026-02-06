import payloadConfig from '@payload-config'
import NextAuth from 'next-auth'
import { getPayload } from 'payload'
import { withPayloadAuthjs } from 'payload-authjs'
import { authConfig } from './authjs-config'

/**
 * Auth.js configuration with lazy initialization (v0.9.0+)
 * @see https://github.com/CrawlerCode/payload-authjs/releases/tag/v0.9.0
 */
const nextAuthResult = NextAuth(async () =>
  withPayloadAuthjs({
    payload: await getPayload({ config: payloadConfig }),
    config: authConfig,
    collectionSlug: 'users'
  })
)

export const handlers = nextAuthResult.handlers
export const signIn = nextAuthResult.signIn
export const signOut = nextAuthResult.signOut
export const auth = nextAuthResult.auth
