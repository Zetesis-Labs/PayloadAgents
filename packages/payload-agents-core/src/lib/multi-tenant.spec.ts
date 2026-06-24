import type { Payload, PayloadRequest, TypedUser } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import { multiTenantSessionStrategy } from './multi-tenant'

/** Minimal request stub — the strategy only forwards it to `extractTenantId`. */
function makeReq(): PayloadRequest {
  return { headers: new Headers() } as unknown as PayloadRequest
}

/** Build a fake Payload whose drizzle.execute returns the rows the test wants. */
function makePayload(rows: Record<string, unknown>[] = []) {
  const execute = vi.fn(async () => ({ rows }))
  const warn = vi.fn()
  const payload = {
    db: { drizzle: { execute } },
    logger: { warn }
  } as unknown as Payload
  return { payload, execute, warn }
}

const alice = { id: 42, collection: 'users' } as unknown as TypedUser

describe('multiTenantSessionStrategy — buildSessionId', () => {
  const strategy = multiTenantSessionStrategy({
    extractTenantId: () => 1
  })

  it('returns a fresh opaque UUID when no chatId is provided', async () => {
    const { payload } = makePayload()
    const id1 = await strategy.buildSessionId({ user: alice, agentSlug: 'bastos', payload, req: makeReq() })
    const id2 = await strategy.buildSessionId({ user: alice, agentSlug: 'bastos', payload, req: makeReq() })
    expect(id1).toMatch(/^[0-9a-f-]{36}$/i)
    expect(id1).not.toBe(id2)
  })

  it('passes through an existing chatId unchanged', async () => {
    const { payload } = makePayload()
    const sessionId = await strategy.buildSessionId({
      user: alice,
      agentSlug: 'bastos',
      chatId: 'continuing-chat-abc',
      payload,
      req: makeReq()
    })
    expect(sessionId).toBe('continuing-chat-abc')
  })
})

describe('multiTenantSessionStrategy — validateSessionOwnership', () => {
  it('returns true when canBypass short-circuits (no DB query)', async () => {
    const strategy = multiTenantSessionStrategy({
      extractTenantId: () => 1,
      canBypass: () => true
    })
    const { payload, execute } = makePayload()
    const ok = await strategy.validateSessionOwnership('any-session', { user: alice, payload, req: makeReq() })
    expect(ok).toBe(true)
    expect(execute).not.toHaveBeenCalled()
  })

  it('returns false when the user has no id', async () => {
    const strategy = multiTenantSessionStrategy({ extractTenantId: () => 1 })
    const { payload, execute } = makePayload()
    const ok = await strategy.validateSessionOwnership('s', {
      user: { collection: 'users' } as unknown as TypedUser,
      payload,
      req: makeReq()
    })
    expect(ok).toBe(false)
    expect(execute).not.toHaveBeenCalled()
  })

  it('returns false when extractTenantId returns null', async () => {
    const strategy = multiTenantSessionStrategy({ extractTenantId: () => null })
    const { payload, execute } = makePayload()
    const ok = await strategy.validateSessionOwnership('s', { user: alice, payload, req: makeReq() })
    expect(ok).toBe(false)
    expect(execute).not.toHaveBeenCalled()
  })

  it('returns false when the session is not found in agno_sessions', async () => {
    const strategy = multiTenantSessionStrategy({ extractTenantId: () => 1 })
    const { payload, warn } = makePayload([])
    const ok = await strategy.validateSessionOwnership('missing-session', {
      user: alice,
      payload,
      req: makeReq()
    })
    expect(ok).toBe(false)
    expect(warn).toHaveBeenCalledOnce()
  })

  it('returns true when stored user_id and tenant_id both match', async () => {
    const strategy = multiTenantSessionStrategy({ extractTenantId: () => 1 })
    const { payload } = makePayload([{ user_id: '42', tenant_id: '1' }])
    const ok = await strategy.validateSessionOwnership('s', { user: alice, payload, req: makeReq() })
    expect(ok).toBe(true)
  })

  it('returns false when stored user_id differs', async () => {
    const strategy = multiTenantSessionStrategy({ extractTenantId: () => 1 })
    const { payload, warn } = makePayload([{ user_id: '99', tenant_id: '1' }])
    const ok = await strategy.validateSessionOwnership('s', { user: alice, payload, req: makeReq() })
    expect(ok).toBe(false)
    expect(warn).toHaveBeenCalledOnce()
  })

  it('returns false when stored tenant_id differs', async () => {
    const strategy = multiTenantSessionStrategy({ extractTenantId: () => 1 })
    const { payload, warn } = makePayload([{ user_id: '42', tenant_id: '2' }])
    const ok = await strategy.validateSessionOwnership('s', { user: alice, payload, req: makeReq() })
    expect(ok).toBe(false)
    expect(warn).toHaveBeenCalledOnce()
  })

  it('back-fills tenant_id and returns true when stored tenant_id is null but user_id matches', async () => {
    const strategy = multiTenantSessionStrategy({ extractTenantId: () => 1 })
    const { payload, execute, warn } = makePayload([{ user_id: '42', tenant_id: null }])
    const ok = await strategy.validateSessionOwnership('s', { user: alice, payload, req: makeReq() })
    expect(ok).toBe(true)
    expect(warn).not.toHaveBeenCalled()
    // Two queries: SELECT to read the row, UPDATE to back-fill metadata.tenant_id.
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it('does not back-fill and returns false when stored tenant_id is null but user_id differs', async () => {
    const strategy = multiTenantSessionStrategy({ extractTenantId: () => 1 })
    const { payload, execute, warn } = makePayload([{ user_id: '99', tenant_id: null }])
    const ok = await strategy.validateSessionOwnership('s', { user: alice, payload, req: makeReq() })
    expect(ok).toBe(false)
    expect(warn).toHaveBeenCalledOnce()
    expect(execute).toHaveBeenCalledOnce()
  })
})

describe('multiTenantSessionStrategy — getRuntimeHeaders', () => {
  it('forwards the tenant id as X-Tenant-Id when present', () => {
    const strategy = multiTenantSessionStrategy({ extractTenantId: () => 7 })
    const { payload } = makePayload()
    const headers = strategy.getRuntimeHeaders({ user: alice, payload, req: makeReq() })
    expect(headers).toEqual({ 'X-Tenant-Id': '7' })
  })

  it('returns an empty object when no tenant is resolved', () => {
    const strategy = multiTenantSessionStrategy({ extractTenantId: () => null })
    const { payload } = makePayload()
    const headers = strategy.getRuntimeHeaders({ user: alice, payload, req: makeReq() })
    expect(headers).toEqual({})
  })
})
