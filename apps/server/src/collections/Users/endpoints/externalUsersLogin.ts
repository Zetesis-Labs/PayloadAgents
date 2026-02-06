import { headersWithCors } from '@payloadcms/next/utilities'
import type { Collection, Endpoint } from 'payload'
import { APIError, generatePayloadCookie } from 'payload'

// A custom endpoint that can be reached by POST request
// at: /api/users/external-users/login
export const externalUsersLogin: Endpoint = {
  handler: async req => {
    let data: { [key: string]: string } = {}

    try {
      if (typeof req.json === 'function') {
        data = await req.json()
      }
    } catch (_error) {
      // swallow error, data is already empty object
    }
    const { password, tenantSlug, tenantDomain, username } = data

    if (!username || !password) {
      throw new APIError('Username and Password are required for login.', 400, null, true)
    }

    const fullTenant = (
      await req.payload.find({
        collection: 'tenants',
        where: tenantDomain
          ? {
              domain: {
                equals: tenantDomain
              }
            }
          : {
              slug: {
                equals: tenantSlug
              }
            }
      })
    ).docs[0]

    const foundUser = await req.payload.find({
      collection: 'users',
      where: {
        or: [
          {
            and: [
              {
                email: {
                  equals: username
                }
              },
              {
                'tenants.tenant': {
                  equals: fullTenant?.id
                }
              }
            ]
          },
          {
            and: [
              {
                username: {
                  equals: username
                }
              },
              {
                'tenants.tenant': {
                  equals: fullTenant?.id
                }
              }
            ]
          }
        ]
      }
    })

    if (foundUser.totalDocs > 0 && foundUser.docs[0]) {
      try {
        const loginAttempt = await req.payload.login({
          collection: 'users',
          data: {
            email: foundUser.docs[0].email,
            password
          },
          req
        })

        if (loginAttempt?.token) {
          const collection = (req.payload.collections as { [key: string]: Collection }).users
          const cookie =
            collection &&
            generatePayloadCookie({
              collectionAuthConfig: collection.config.auth,
              cookiePrefix: req.payload.config.cookiePrefix,
              token: loginAttempt.token
            })

          const responseHeaders = new Headers()
          if (cookie) {
            responseHeaders.set('Set-Cookie', cookie)
          }

          return Response.json(loginAttempt, {
            headers: headersWithCors({
              headers: responseHeaders,
              req
            }),
            status: 200
          })
        }

        throw new APIError('Unable to login with the provided username and password.', 400, null, true)
      } catch (_e) {
        throw new APIError('Unable to login with the provided username and password.', 400, null, true)
      }
    }

    throw new APIError('Unable to login with the provided username and password.', 400, null, true)
  },
  method: 'post',
  path: '/external-users/login'
}
