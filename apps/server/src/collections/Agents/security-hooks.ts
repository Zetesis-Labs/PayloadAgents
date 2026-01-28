import type { CollectionBeforeChangeHook, CollectionAfterReadHook } from 'payload'
import { encrypt, decrypt, isEncrypted } from '@/utilities/encryption'

/**
 * Encrypts the apiKey field before saving to the database.
 */
export const encryptApiKeyBeforeChange: CollectionBeforeChangeHook = async ({
    data,
    originalDoc,
}) => {
    // Only encrypt if apiKey is present and has changed
    if (data.apiKey) {
        // Check if it's already encrypted (in case of updates that don't touch the field)
        if (!isEncrypted(data.apiKey)) {
            console.log('[Agents Security] Encrypting API key before save')
            data.apiKey = encrypt(data.apiKey)
        } else if (originalDoc?.apiKey === data.apiKey) {
            // The encrypted value hasn't changed, keep it as-is
            console.log('[Agents Security] API key unchanged, keeping encrypted value')
        }
    }

    return data
}

/**
 * Decrypts the apiKey field after reading from the database.
 */
export const decryptApiKeyAfterRead: CollectionAfterReadHook = async ({ doc }) => {
    if (doc.apiKey && isEncrypted(doc.apiKey)) {
        try {
            doc.apiKey = decrypt(doc.apiKey)
        } catch (error) {
            console.error('[Agents Security] Failed to decrypt API key:', error)
            // Return a placeholder to indicate decryption failed
            doc.apiKey = '[DECRYPTION_FAILED]'
        }
    }

    return doc
}
