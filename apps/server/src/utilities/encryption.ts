import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // 96 bits for GCM
const AUTH_TAG_LENGTH = 16
const SALT_LENGTH = 16
const KEY_LENGTH = 32 // 256 bits

/**
 * Get the encryption key from environment variable.
 * The key is derived using scrypt for added security.
 */
function getEncryptionKey(salt: Buffer): Buffer {
    const secret = process.env.PAYLOAD_SECRET
    if (!secret) {
        throw new Error(
            'PAYLOAD_SECRET environment variable is required for encryption. ' +
            'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
        )
    }
    return scryptSync(secret, salt, KEY_LENGTH)
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * 
 * The output format is: salt:iv:authTag:ciphertext (all base64 encoded)
 * 
 * @param plaintext - The string to encrypt
 * @returns The encrypted string in format salt:iv:authTag:ciphertext
 */
export function encrypt(plaintext: string): string {
    if (!plaintext) {
        return plaintext
    }

    const salt = randomBytes(SALT_LENGTH)
    const key = getEncryptionKey(salt)
    const iv = randomBytes(IV_LENGTH)

    const cipher = createCipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_LENGTH,
    })

    const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
    ])

    const authTag = cipher.getAuthTag()

    // Format: salt:iv:authTag:ciphertext
    return [
        salt.toString('base64'),
        iv.toString('base64'),
        authTag.toString('base64'),
        encrypted.toString('base64'),
    ].join(':')
}

/**
 * Decrypts a ciphertext string that was encrypted with encrypt().
 * 
 * @param ciphertext - The encrypted string in format salt:iv:authTag:ciphertext
 * @returns The decrypted plaintext string
 */
export function decrypt(ciphertext: string): string {
    if (!ciphertext) {
        return ciphertext
    }

    // Check if the value looks like it's encrypted (has the expected format)
    const parts = ciphertext.split(':')
    if (parts.length !== 4) {
        // Not encrypted (legacy data or plain text), return as-is
        console.warn('[Encryption] Value does not appear to be encrypted, returning as-is')
        return ciphertext
    }

    const [saltB64, ivB64, authTagB64, encryptedB64] = parts

    try {
        const salt = Buffer.from(saltB64, 'base64')
        const iv = Buffer.from(ivB64, 'base64')
        const authTag = Buffer.from(authTagB64, 'base64')
        const encrypted = Buffer.from(encryptedB64, 'base64')

        const key = getEncryptionKey(salt)

        const decipher = createDecipheriv(ALGORITHM, key, iv, {
            authTagLength: AUTH_TAG_LENGTH,
        })
        decipher.setAuthTag(authTag)

        const decrypted = Buffer.concat([
            decipher.update(encrypted),
            decipher.final(),
        ])

        return decrypted.toString('utf8')
    } catch (error) {
        console.error('[Encryption] Failed to decrypt value:', error)
        throw new Error('Failed to decrypt value. The encryption key may have changed.')
    }
}

/**
 * Checks if a value appears to be encrypted (has the expected format).
 */
export function isEncrypted(value: string): boolean {
    if (!value) return false
    const parts = value.split(':')
    return parts.length === 4
}
