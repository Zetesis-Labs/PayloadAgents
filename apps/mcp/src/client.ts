/**
 * Typesense client factory
 */

import { Client } from 'typesense'
import { typesenseConfig } from './config'

let client: Client | null = null

export function getTypesenseClient(): Client {
  if (!client) {
    client = new Client(typesenseConfig)
  }
  return client
}
