import { fileURLToPath } from 'node:url'

import {
  ExtractedApplication,
  GuidelineContext,
  RiskAssessment,
} from '@prism/contracts'
import { config as loadDotenv } from 'dotenv'
import { describe, expect, test } from 'vitest'

import extractedFixture from '../../../fixtures/extracted-application.json'
import guidelineFixture from '../../../fixtures/guideline-context.json'
import { riskStage } from '../src/stages/risk'
import { type PipelineState } from '../src/state'

// Loaded in this file only — unit tests must stay key-free and offline.
loadDotenv({
  path: fileURLToPath(new URL('../../../.env', import.meta.url)),
  quiet: true,
})

const guidelines = GuidelineContext.parse(guidelineFixture)

/** Real-model smoke test: skipped unless a key is configured. */
describe.skipIf(!process.env.ANTHROPIC_API_KEY)(
  'risk assessment against real Sonnet',
  () => {
    test(
      'returns a schema-valid assessment citing only fixture chunks',
      { timeout: 120_000 },
      async () => {
        const state: PipelineState = {
          submission: { source: 'form', form: {} },
          extraction: ExtractedApplication.parse(extractedFixture),
          guidelines,
        }
        const result = await riskStage.run(state, {
          applicationId: '3f7c9d1e-8a2b-4c5d-9e6f-1a2b3c4d5e6f',
          requestId: 'req-integration',
          mockMode: false,
          emit: () => undefined,
        })

        const assessment = RiskAssessment.parse(result.risk)
        const known = new Set(guidelines.chunks.map((c) => c.id))
        const cited = [
          ...assessment.riskFactors.flatMap((f) => f.citations),
          ...assessment.suggestedConditions.flatMap((c) => c.citations),
        ]

        expect(assessment.riskFactors.length).toBeGreaterThan(0)
        expect(cited.every((id) => known.has(id))).toBe(true)
        expect(result.citationCheck?.hallucinationFlag).toBe(false)
      }
    )
  }
)
