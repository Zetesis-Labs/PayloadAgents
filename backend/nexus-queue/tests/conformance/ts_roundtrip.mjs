// Cross-language conformance helper: enqueues through the REAL TypeScript
// client (@zetesis/nexus-queue dist) against a live kicker. Driven by
// test_cross_language.py via env vars; exits non-zero on any failure.
const dist = process.env.NEXUS_DIST
const { NexusQueueClient } = await import(dist)

const client = new NexusQueueClient({
  kickerUrl: process.env.KICKER_URL,
  secret: process.env.NEXUS_SECRET
})

const result = await client.enqueue(
  'test.xlang',
  { id: 'xl1' },
  {
    tenant: 't9',
    idempotencyKey: 'test-xl1',
    priority: 'high',
    trace: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
  }
)

if (result.status !== 'queued' || !result.taskId) {
  console.error(`unexpected enqueue result: ${JSON.stringify(result)}`)
  process.exit(1)
}
console.log(result.taskId)
