# @zetesis/nexus-queue

TypeScript producer client for the **Nexus-Queue** standard. Enqueues tasks onto
a worker by POSTing to its HTTP kicker; the kicker stamps the standard envelope
labels server-side, so a TS producer and a Python producer put the same shape on
the wire.

```ts
import { NexusQueueClient } from '@zetesis/nexus-queue'

const queue = new NexusQueueClient({
  kickerUrl: process.env.PAYLOAD_WORKER_URL!,
  secret: process.env.INTERNAL_SECRET!
})

await queue.enqueue(
  'zp.documents.parse',
  { document_id: id },
  { idempotencyKey: id, tenant }
)
```

The Python worker runtime lives in the `nexus-queue` PyPI package.
