import { cookies } from 'next/headers'
import { type NextRequest, NextResponse } from 'next/server'
import { auth, signOut } from '@/modules/authjs/plugins'

/**
 * POST /api/auth/logout
 * Custom logout endpoint that includes id_token_hint for proper Keycloak logout
 */
export async function POST(_request: NextRequest) {
  console.log('[Logout API] ========== INICIO DEL PROCESO DE LOGOUT ==========')

  try {
    console.log('[Logout API] 1️⃣ Obteniendo sesión actual...')
    const session = await auth()

    if (!session) {
      console.log('[Logout API] ❌ No hay sesión activa')
      return NextResponse.json({ error: 'No hay sesión activa' }, { status: 401 })
    }

    console.log('[Logout API] ✅ Sesión encontrada:', {
      userId: session.user?.id,
      userEmail: session.user?.email,
      hasIdToken: !!session.id_token
    })

    // Get the id_token from the session
    const idToken = session.id_token
    console.log('[Logout API] 2️⃣ ID Token:', idToken ? `${idToken.substring(0, 20)}...` : 'NO DISPONIBLE')

    // Sign out from NextAuth
    console.log('[Logout API] 3️⃣ Llamando a signOut()...')
    await signOut({ redirect: false })
    console.log('[Logout API] ✅ signOut() completado')

    // Build Keycloak logout URL with id_token_hint
    console.log('[Logout API] 4️⃣ Construyendo URL de logout de Keycloak...')
    const keycloakLogoutUrl = new URL(
      `${process.env.NEXT_PUBLIC_LOCAL_KEYCLOAK_URL}/realms/${process.env.NEXT_PUBLIC_KC_REALM}/protocol/openid-connect/logout`
    )

    // Add id_token_hint if available
    if (idToken) {
      keycloakLogoutUrl.searchParams.set('id_token_hint', idToken)
      console.log('[Logout API] ✅ id_token_hint agregado al URL')
    } else {
      console.log('[Logout API] ⚠️ NO se pudo agregar id_token_hint (no disponible)')
    }

    // Add post_logout_redirect_uri
    const postLogoutRedirectUri = process.env.NEXTAUTH_URL || 'http://localhost:3000'
    keycloakLogoutUrl.searchParams.set('post_logout_redirect_uri', postLogoutRedirectUri)
    console.log('[Logout API] ✅ post_logout_redirect_uri configurado:', postLogoutRedirectUri)

    console.log('[Logout API] 5️⃣ URL completa de Keycloak logout:', keycloakLogoutUrl.toString())

    console.log('[Logout API] 6️⃣ Creando respuesta y limpiando cookies...')
    const response = NextResponse.json({
      success: true,
      logoutUrl: keycloakLogoutUrl.toString()
    })

    // Clear all auth-related cookies explicitly
    console.log('[Logout API] 7️⃣ Limpiando cookies de NextAuth...')
    const cookieStore = await cookies()
    const allCookies = cookieStore.getAll()
    let cookiesCleared = 0

    allCookies.forEach(cookie => {
      if (
        cookie.name.includes('next-auth') ||
        cookie.name.includes('authjs') ||
        cookie.name === '__Secure-authjs.session-token' ||
        cookie.name === 'authjs.session-token'
      ) {
        console.log(`   [Logout API] Limpiando cookie: ${cookie.name}`)
        response.cookies.set(cookie.name, '', {
          maxAge: 0,
          path: '/',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax'
        })
        cookiesCleared++
      }
    })

    console.log(`[Logout API] ✅ ${cookiesCleared} cookies limpiadas`)
    console.log('[Logout API] ========== FIN DEL PROCESO DE LOGOUT ==========')

    return response
  } catch (error) {
    console.error('[Logout API] ❌❌❌ ERROR durante logout:', error)
    console.error('[Logout API] Stack:', error instanceof Error ? error.stack : 'No stack available')

    return NextResponse.json(
      {
        error: 'Error al cerrar sesión',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    )
  }
}
