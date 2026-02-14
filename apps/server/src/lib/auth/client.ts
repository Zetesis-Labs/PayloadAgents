import { genericOAuthClient, usernameClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_SERVER_URL,
  plugins: [usernameClient(), genericOAuthClient()]
})

export const { signUp, signIn, signOut, useSession } = authClient
