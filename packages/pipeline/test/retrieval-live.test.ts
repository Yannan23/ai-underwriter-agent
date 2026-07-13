import { fileURLToPath } from 'node:url'

import { ExtractedApplication } from '@prism/contracts'
import { config as loadEnv } from 'dotenv'
import { describe, expect, test } from 'vitest'

import extractedFixture from '../../../fixtures/extracted-application.json'
import { loadGuidelineCorpus } from '../src/corpus'
import {
  resetCorpusEmbeddingsForTests,
  retrieveGuidelines,
  TOP_K,
} from '../src/corpus/retrieve'

// The real key lives in the repo-root .env; loaded in this file only so unit
// tests never see live credentials. Skipped entirely when no key is present.
loadEnv({
  path: fileURLToPath(new URL('../../../.env', import.meta.url)),
  quiet: true,
})

describe.skipIf(!process.env.VOYAGE_API_KEY)(
  'retrieval (live Voyage API)',
  () => {
    test(
      'ranks the management-consultant appetite chunk in the top 6 for the fixture application',
      { timeout: 60_000 },
      async () => {
        resetCorpusEmbeddingsForTests()
        const app = ExtractedApplication.parse(extractedFixture)
        const appetiteChunk = loadGuidelineCorpus().find(
          (chunk) =>
            chunk.headingPath.join(' > ') ===
            'Appetite > Management Consultants'
        )

        expect(appetiteChunk).toBeDefined()
        const context = await retrieveGuidelines(app)

        expect(context.chunks).toHaveLength(TOP_K)
        expect(context.chunks.map((chunk) => chunk.id)).toContain(
          appetiteChunk?.id
        )
        expect(
          context.retrievalScores[appetiteChunk?.id ?? '']
        ).toBeGreaterThan(0)
      }
    )
  }
)
