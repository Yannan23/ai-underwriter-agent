import './env'

import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { serve } from '@hono/node-server'
import { RawSubmission } from '@prism/contracts'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'

import { startPipeline } from './run'
import { applications, createApplication, subscribe } from './store'

const mockMode = process.env.MOCK_MODE === 'true'
const app = new Hono()

app.get('/', (c) =>
  c.html(readFileSync(new URL('../../web/index.html', import.meta.url), 'utf8'))
)

app.get('/health', (c) => c.json({ ok: true, mockMode }))

app.post('/applications', async (c) => {
  const body = await c.req.json<unknown>().catch(() => null)
  const parsed = RawSubmission.safeParse(body)

  if (!parsed.success) {
    return c.json(
      { error: 'invalid submission', issues: parsed.error.flatten() },
      400
    )
  }
  const record = createApplication(randomUUID(), parsed.data)

  startPipeline(record)

  return c.json({ applicationId: record.id, status: record.status }, 201)
})

app.get('/applications/:id', (c) => {
  const record = applications.get(c.req.param('id'))

  if (!record) return c.json({ error: 'not found' }, 404)

  return c.json({
    id: record.id,
    status: record.status,
    events: record.events,
    result: record.result ?? null,
  })
})

/**
 * SSE progress stream: replays persisted events, then live-streams new ones;
 * ends with a `result` event once the pipeline finishes (or is paused on RFI).
 * record.events is the single source of truth — a cursor walks it in order and
 * every write is awaited, so nothing is lost when the stream closes.
 */
app.get('/applications/:id/stream', (c) => {
  const record = applications.get(c.req.param('id'))

  if (!record) return c.json({ error: 'not found' }, 404)

  return streamSSE(c, async (stream) => {
    let notify: () => void = () => undefined

    stream.onAbort(() => notify())
    const unsubscribe = subscribe(record.id, {
      onEvent: () => notify(),
      onDone: () => notify(),
    })

    try {
      let cursor = 0

      for (;;) {
        // Arm the waiter before draining: anything appended mid-drain resolves it immediately.
        const waiter = new Promise<void>((resolve) => {
          notify = resolve
        })

        while (cursor < record.events.length && !stream.aborted) {
          const event = record.events[cursor++]

          await stream.writeSSE({
            event: 'stage',
            data: JSON.stringify(event),
            id: String(event?.seq),
          })
        }
        if (stream.aborted || record.done) break
        await waiter
      }
      if (!stream.aborted && record.done) {
        await stream.writeSSE({
          event: 'result',
          data: JSON.stringify(record.result ?? { status: record.status }),
        })
      }
    } finally {
      unsubscribe()
    }
  })
})

const port = Number(process.env.PORT ?? 3000)

serve({ fetch: app.fetch, port })
// eslint-disable-next-line no-console -- intentional startup log
console.log(`prism api listening on :${port} (mockMode=${mockMode})`)

export { app }
