import type { IncomingMessage } from 'node:http'
import { describe, expect, it } from 'vitest'
import { resolveAuth } from './resolve'

const req = (headers: Record<string, string>): IncomingMessage => ({ headers }) as unknown as IncomingMessage

/** Encode weights the same way the proxy does: Float32LE [...w, b], base64. */
function encodeLearnedHead(w: number[], b: number): string {
  const buf = Buffer.alloc((w.length + 1) * 4)
  for (let i = 0; i < w.length; i++) buf.writeFloatLE(w[i] ?? 0, i * 4)
  buf.writeFloatLE(b, w.length * 4)
  return buf.toString('base64')
}

const encodeProfiles = (p: Array<{ slug: string; name: string; description: string }>): string =>
  Buffer.from(JSON.stringify(p)).toString('base64')

describe('resolveAuth', () => {
  it('returns null when no recognized headers are present', () => {
    expect(resolveAuth(req({}), { type: 'header' })).toBeNull()
  })

  it('reads the tenant slug', () => {
    expect(resolveAuth(req({ 'x-tenant-slug': 'acme' }), { type: 'header' })?.tenantSlug).toBe('acme')
  })

  it('round-trips learned-head weights from the header', () => {
    const w = [0.5, -1.25, 3.0, 0]
    const b = -0.0625
    const ctx = resolveAuth(req({ 'x-learned-head': encodeLearnedHead(w, b) }), { type: 'header' })
    const head = ctx?.retrieval?.learnedHead
    expect(head?.w).toHaveLength(4)
    head?.w.forEach((v, i) => expect(v).toBeCloseTo(w[i] ?? 0, 5))
    expect(head?.b).toBeCloseTo(b, 5)
  })

  it('ignores a learned-head header that is too short to be valid weights', () => {
    // "AAA" decodes to 2 bytes — below the 8-byte floor (at least one weight + bias).
    const ctx = resolveAuth(req({ 'x-tenant-slug': 'acme', 'x-learned-head': 'AAA' }), { type: 'header' })
    expect(ctx?.retrieval?.learnedHead).toBeUndefined()
  })

  it('decodes the available-profiles catalog', () => {
    const profiles = [
      { slug: 'legal', name: 'Legal', description: 'legal docs' },
      { slug: 'tech', name: 'Tech', description: 'technical' }
    ]
    const ctx = resolveAuth(req({ 'x-retrieval-profiles': encodeProfiles(profiles) }), { type: 'header' })
    expect(ctx?.availableProfiles).toEqual(profiles)
  })
})
