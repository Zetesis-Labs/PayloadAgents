'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export async function signInWithKeycloak() {
  const { getPayload } = await import('@/modules/get-payload')
  const payload = await getPayload()

  // Call the better-auth API to get the Keycloak authorization URL.
  // The nextCookies() plugin ensures state cookies are set on the response.
  const result = await (payload as Record<string, any>).betterAuth.api.signInWithOAuth2({
    body: {
      providerId: 'keycloak',
      callbackURL: '/'
    },
    headers: await headers()
  })

  if (result?.url) {
    redirect(result.url)
  }
}
