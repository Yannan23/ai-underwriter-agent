import { fileURLToPath } from 'node:url'

import { config } from 'dotenv'

// Root .env — pnpm runs package scripts with cwd=apps/api, so an explicit
// path is required. Missing file is a no-op (mock mode needs no keys).
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) })

/**
 * Tolerant parsing: dashboard env editors love stray whitespace and casing
 * ("true\n", "True"), and a strict === comparison silently flips the service
 * into real-model mode. Trim + lowercase before comparing.
 */
export const mockMode =
  (process.env.MOCK_MODE ?? '').trim().toLowerCase() === 'true'

// Fail at boot, not on the first application: a real-mode deploy without keys
// must be caught by the platform health check, never by a user mid-submission.
if (!mockMode) {
  for (const key of ['ANTHROPIC_API_KEY', 'VOYAGE_API_KEY']) {
    if (!process.env[key]?.trim()) {
      throw new Error(
        `MOCK_MODE is not "true", so ${key} is required — refusing to start`
      )
    }
  }
}
