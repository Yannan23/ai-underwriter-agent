import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { ExtractedApplication, OCCUPATION_CLASSES } from '@prism/contracts'
import { config } from 'dotenv'
import { describe, expect, test } from 'vitest'

import { extractApplication } from '../src/stages/extraction-llm'

// Load the repo-root .env for this file only: the live test needs a real
// ANTHROPIC_API_KEY. Unit tests never touch the network — without a key this
// whole suite is skipped (e.g. in CI).
config({
  path: path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../.env'
  ),
  quiet: true,
})

describe.skipIf(!process.env.ANTHROPIC_API_KEY)('live Haiku extraction', () => {
  test(
    'extracts a small proposal form into a contract-valid application',
    { timeout: 120_000 },
    async () => {
      const extraction = await extractApplication({
        legalName: 'Acme Advisory Pty Ltd',
        abn: '51 824 753 556',
        state: 'VIC',
        yearsInPractice: 6,
        occupation: 'software development consultancy',
        annualFeeIncome: 750000,
        staffCount: 3,
        usCanadaPct: 0,
        limitRequested: 1000000,
        claimsLast5Years: 'none',
      })
      // extractApplication already contract-validates; parse again to assert it.
      const parsed = ExtractedApplication.parse(extraction)

      expect(parsed.insured.state).toBe('VIC')
      expect(parsed.insured.abn).toBe('51824753556')
      expect(parsed.business.occupationClass).not.toBeNull()
      expect(OCCUPATION_CLASSES).toContain(parsed.business.occupationClass)
      expect(Object.keys(parsed.fieldConfidence).length).toBeGreaterThan(0)
    }
  )
})
