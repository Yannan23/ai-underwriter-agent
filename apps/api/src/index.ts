import { randomUUID } from 'node:crypto'
import { serve } from '@hono/node-server'
import { RawSubmission } from '@prism/contracts'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { appendEvent, applications } from './store'

const mockMode = process.env.MOCK_MODE === 'true'
const app = new Hono()

app.get('/health', (c) => c.json({ ok: true, mockMode }))

app.post('/applications', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = RawSubmission.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'invalid submission', issues: parsed.error.flatten() }, 400)
  }
  const id = randomUUID()
  applications.set(id, {
    id,
    status: 'received',
    submission: parsed.data,
    events: [],
    createdAt: new Date().toISOString(),
  })
  // Block ③ wires runPipeline() here (fire-and-forget; progress via /stream).
  return c.json({ applicationId: id, status: 'received' }, 201)
})

app.get('/applications/:id', (c) => {
  const record = applications.get(c.req.param('id'))
  if (!record) return c.json({ error: 'not found' }, 404)
  return c.json({ id: record.id, status: record.status, events: record.events })
})

// SSE: replays persisted events, then streams live ones. Until the pipeline is
// wired (block ③), it replays whatever exists and announces itself.
app.get('/applications/:id/stream', (c) => {
  const record = applications.get(c.req.param('id'))
  if (!record) return c.json({ error: 'not found' }, 404)
  return streamSSE(c, async (stream) => {
    for (const event of record.events) {
      await stream.writeSSE({ event: 'stage', data: JSON.stringify(event), id: String(event.seq) })
    }
    await stream.writeSSE({
      event: 'info',
      data: JSON.stringify({ message: 'pipeline not wired yet — lands in build-plan block ③' }),
    })
  })
})

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port })
console.log(`prism api listening on :${port} (mockMode=${mockMode})`)

export { app, appendEvent }
