/**
 * Hooks for encrypting/decrypting secret fields on the Agents collection.
 *
 * - `beforeChange`: encrypts the API key before saving to the database.
 * - `afterRead`: decrypts only for internal requests or super-admin users;
 *   all other consumers receive `apiKey: undefined`.
 */

import type { CollectionAfterReadHook, CollectionBeforeChangeHook, PayloadRequest } from 'payload'
import { decrypt, encrypt, isEncrypted } from '../../lib/encryption'
import type { ResolvedPluginConfig } from '../../types'

const SECRET_FIELDS = ['apiKey', 'litellmVirtualKey'] as const
// Non-encrypted but operator-only: the key fingerprint (last-4) and the raw
// LiteLLM error text (internal gateway URLs / HTTP bodies) must not reach tenant
// chat users, who can read the agent (collection read is permissive).
const REDACTED_FIELDS = ['litellmVirtualKeyFingerprint', 'litellmVirtualKeySyncError'] as const

function hideSecretFields(doc: Record<string, unknown>): void {
  for (const field of [...SECRET_FIELDS, ...REDACTED_FIELDS]) {
    doc[field] = undefined
  }
}

function canExposeSecretFields(context: Record<string, unknown> | undefined, req: PayloadRequest): boolean {
  if (req.payloadAPI === 'local') return true
  if (context?.internalAgentRead === true) return true
  const userRoles = req.user && 'role' in req.user ? (req.user as unknown as { role: string[] }).role : []
  return Array.isArray(userRoles) && userRoles.includes('superadmin')
}

function decryptSecretFields(doc: Record<string, unknown>, encryptionKey: string): void {
  for (const field of SECRET_FIELDS) {
    const value = doc[field]
    if (typeof value !== 'string' || !isEncrypted(value)) continue
    try {
      doc[field] = decrypt(value, encryptionKey)
    } catch (error) {
      console.error(`[Agents Security] Failed to decrypt ${field}:`, error instanceof Error ? error.message : 'unknown')
      doc[field] = '[DECRYPTION_FAILED]'
    }
  }
}

export function createEncryptBeforeChangeHook(config: ResolvedPluginConfig): CollectionBeforeChangeHook {
  return async ({ data }) => {
    if (data.apiKey && !isEncrypted(data.apiKey)) {
      data.apiKeyFingerprint = data.apiKey.slice(-4)
      if (config.encryptionKey) {
        data.apiKey = encrypt(data.apiKey, config.encryptionKey)
      }
    }
    if (data.litellmVirtualKey && !isEncrypted(data.litellmVirtualKey) && config.encryptionKey) {
      data.litellmVirtualKey = encrypt(data.litellmVirtualKey, config.encryptionKey)
    }
    return data
  }
}

export function createDecryptAfterReadHook(config: ResolvedPluginConfig): CollectionAfterReadHook {
  return async ({ context, doc, req }) => {
    if (!config.encryptionKey) return doc

    // Set by the internal `agents/internal/list` endpoint — the only
    // out-of-process caller that needs decrypted keys.
    if (!canExposeSecretFields(context, req)) {
      hideSecretFields(doc)
      return doc
    }

    decryptSecretFields(doc, config.encryptionKey)
    return doc
  }
}
