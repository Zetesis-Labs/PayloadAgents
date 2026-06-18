import { describe, expect, it } from 'vitest'
import { decrypt, isEncrypted } from '../../lib/encryption'
import type { ResolvedPluginConfig } from '../../types'
import { createDecryptAfterReadHook, createEncryptBeforeChangeHook } from './encrypt-api-key'

const CFG = { encryptionKey: 'test-secret' } as ResolvedPluginConfig

type BeforeArgs = Parameters<ReturnType<typeof createEncryptBeforeChangeHook>>[0]
type AfterArgs = Parameters<ReturnType<typeof createDecryptAfterReadHook>>[0]

function beforeArgs(data: Record<string, unknown>): BeforeArgs {
  return { data } as unknown as BeforeArgs
}

function afterArgs(doc: Record<string, unknown>, context: Record<string, unknown> = {}): AfterArgs {
  return {
    doc,
    context,
    req: {
      payloadAPI: 'REST',
      user: undefined
    }
  } as unknown as AfterArgs
}

describe('agent secret field hooks', () => {
  it('encrypts provider and LiteLLM keys before save', async () => {
    const data = { apiKey: 'sk-provider', litellmVirtualKey: 'sk-litellm' }

    await createEncryptBeforeChangeHook(CFG)(beforeArgs(data))

    expect(isEncrypted(data.apiKey)).toBe(true)
    expect(isEncrypted(data.litellmVirtualKey)).toBe(true)
    expect(data.apiKeyFingerprint).toBe('ider')
    expect(decrypt(data.apiKey, 'test-secret')).toBe('sk-provider')
    expect(decrypt(data.litellmVirtualKey, 'test-secret')).toBe('sk-litellm')
  })

  it('hides secrets from normal reads', async () => {
    const doc = {
      apiKey: 'enc:any',
      litellmVirtualKey: 'enc:any'
    }

    await createDecryptAfterReadHook(CFG)(afterArgs(doc))

    expect(doc.apiKey).toBeUndefined()
    expect(doc.litellmVirtualKey).toBeUndefined()
  })

  it('decrypts both secrets for internal runtime reads', async () => {
    const doc = {
      apiKey: 'sk-provider',
      litellmVirtualKey: 'sk-litellm'
    }
    await createEncryptBeforeChangeHook(CFG)(beforeArgs(doc))

    await createDecryptAfterReadHook(CFG)(afterArgs(doc, { internalAgentRead: true }))

    expect(doc.apiKey).toBe('sk-provider')
    expect(doc.litellmVirtualKey).toBe('sk-litellm')
  })

  it('redacts the key fingerprint and raw sync error from normal reads', async () => {
    const doc = {
      litellmVirtualKeyFingerprint: 'x9f2',
      litellmVirtualKeySyncError: 'LiteLLM /key/generate failed: HTTP 500 http://litellm:4000'
    }

    await createDecryptAfterReadHook(CFG)(afterArgs(doc))

    expect(doc.litellmVirtualKeyFingerprint).toBeUndefined()
    expect(doc.litellmVirtualKeySyncError).toBeUndefined()
  })

  it('keeps the fingerprint and sync error for internal runtime reads', async () => {
    const doc = {
      litellmVirtualKeyFingerprint: 'x9f2',
      litellmVirtualKeySyncError: 'boom'
    }

    await createDecryptAfterReadHook(CFG)(afterArgs(doc, { internalAgentRead: true }))

    expect(doc.litellmVirtualKeyFingerprint).toBe('x9f2')
    expect(doc.litellmVirtualKeySyncError).toBe('boom')
  })
})
