import { getPayload as getPayloadInstance } from 'payload'

export async function getPayload(): ReturnType<typeof getPayloadInstance> {
  // Importación dinámica para evitar dependencia circular
  // @payload-config exporta una Promise, no el config directamente
  const configModule = await import('@payload-config')
  const configPromise = configModule.default
  return getPayloadInstance({ config: configPromise })
}
