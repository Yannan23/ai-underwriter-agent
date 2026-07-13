import { fileURLToPath } from 'node:url'

import { config } from 'dotenv'

// Root .env — pnpm runs package scripts with cwd=apps/api, so an explicit
// path is required. Missing file is a no-op (mock mode needs no keys).
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) })
