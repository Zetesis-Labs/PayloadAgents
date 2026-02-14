import { getPayloadAuth } from 'payload-auth/better-auth'

export async function getPayload() {
  // Dynamic import to avoid circular dependency
  // @payload-config exports a Promise, not the config directly
  const configModule = await import('@payload-config')
  return getPayloadAuth(configModule.default)
}
