import { watch } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { type Hono } from 'hono'
import { streamSSE } from 'hono/streaming'

// Dev-only live reload: the `dev` script sets DEV_RELOAD=true; the
// production `start` script never does, so deploys serve the page untouched.
export const devReloadEnabled =
  (process.env.DEV_RELOAD ?? '').trim().toLowerCase() === 'true'

const webDir = fileURLToPath(new URL('../../web', import.meta.url))

/**
 * Snippet injected before </body> in dev: reloads the page when the server
 * pushes a change event (HTML edit) or when the SSE connection drops
 * (tsx watch restart) — in that case it waits for /health to come back first.
 */
export const devReloadSnippet = `<script>
  (() => {
    const source = new EventSource('/dev/reload')
    source.addEventListener('change', () => location.reload())
    source.onerror = () => {
      source.close()
      const retry = setInterval(() => {
        fetch('/health')
          .then(() => {
            clearInterval(retry)
            location.reload()
          })
          .catch(() => undefined)
      }, 300)
    }
  })()
</script>`

/** SSE endpoint emitting `change` whenever a file in apps/web is saved. */
export function registerDevReload(app: Hono): void {
  app.get('/dev/reload', (c) =>
    streamSSE(c, async (stream) => {
      const watcher = watch(webDir, { recursive: true }, () => {
        void (async () => {
          try {
            await stream.writeSSE({ event: 'change', data: 'reload' })
          } catch {
            // client already gone — the abort handler closes the watcher
          }
        })()
      })

      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          watcher.close()
          resolve()
        })
      })
    })
  )
}
