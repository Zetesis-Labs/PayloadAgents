import { cookies, headers } from 'next/headers'
import { type NextRequest, NextResponse } from 'next/server'
import { getPayload } from '@/modules/get-payload'
import { getIdTokenForUser } from '@/modules/keycloak/utils/save-id-token'

/**
 * POST /api/auth/logout
 * Custom logout endpoint that includes id_token_hint for proper Keycloak logout
 */
export async function POST(_request: NextRequest) {
  console.log('[Logout] Starting logout process...')

  try {
    const payload = await getPayload()
    const headersList = await headers()

    // Get current session
    const { user } = await payload.auth({ headers: headersList })

    if (!user || !('email' in user)) {
      console.log('[Logout] No active session')
      return NextResponse.json({ error: 'No active session' }, { status: 401 })
    }

    console.log('[Logout] User:', user.email)

    // Get idToken from accounts collection (saved automatically by better-auth)
    const idToken = await getIdTokenForUser(payload, user.id)
    console.log('[Logout] ID Token:', idToken ? 'available' : 'not available')

    // Revoke better-auth session
    try {
      await (payload as Record<string, any>).betterAuth.api.signOut({
        headers: headersList,
      })
      console.log('[Logout] Session revoked')
    } catch (error) {
      console.error('[Logout] Error revoking session:', error)
    }

    // Build Keycloak logout URL
    const keycloakLogoutUrl = new URL(
      `${process.env.NEXT_PUBLIC_LOCAL_KEYCLOAK_URL}/realms/${process.env.NEXT_PUBLIC_KC_REALM}/protocol/openid-connect/logout`,
    )

    if (idToken) {
      keycloakLogoutUrl.searchParams.set('id_token_hint', idToken)
    }

    const postLogoutRedirectUri = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
    keycloakLogoutUrl.searchParams.set('post_logout_redirect_uri', postLogoutRedirectUri)

    console.log('[Logout] Keycloak logout URL built')

    // Create response and clear cookies
    const response = NextResponse.json({
      success: true,
      logoutUrl: keycloakLogoutUrl.toString(),
    })

    // Clear better-auth cookies
    const cookieStore = await cookies()
    const allCookies = cookieStore.getAll()

    allCookies.forEach(cookie => {
      if (cookie.name.includes('better-auth')) {
        response.cookies.set(cookie.name, '', {
          maxAge: 0,
          path: '/',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
        })
      }
    })

    console.log('[Logout] Complete')
    return response
  } catch (error) {
    console.error('[Logout] Error:', error)
    return NextResponse.json(
      { error: 'Logout failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
