import type { Client } from 'typesense'
import Typesense from 'typesense'
import type { TypesenseConnectionConfig } from '../../shared/types/plugin-types'

export const createTypesenseClient = (typesenseConfig: TypesenseConnectionConfig) => {
  return new Typesense.Client({
    apiKey: typesenseConfig.apiKey,
    connectionTimeoutSeconds: typesenseConfig.connectionTimeoutSeconds || 2,
    nodes: typesenseConfig.nodes
  })
}

export const testTypesenseConnection = async (client: Client): Promise<boolean> => {
  try {
    await client.health.retrieve()
    return true
  } catch (_error) {
    // Handle Typesense connection error
    return false
  }
}
