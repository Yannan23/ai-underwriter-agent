import { describe, expect, it } from 'vitest'
import extractedFixture from '../../../fixtures/extracted-application.json'
import { ExtractedApplication, RawSubmission, StageEvent } from '../src/index'

describe('contracts', () => {
  it('extraction fixture conforms to ExtractedApplication', () => {
    const parsed = ExtractedApplication.safeParse(extractedFixture)
    expect(parsed.success, JSON.stringify(parsed.success ? '' : parsed.error.issues)).toBe(true)
  })

  it('rejects an invalid ABN', () => {
    const bad = { ...extractedFixture, insured: { ...extractedFixture.insured, abn: '123' } }
    expect(ExtractedApplication.safeParse(bad).success).toBe(false)
  })

  it('accepts a minimal form submission', () => {
    const parsed = RawSubmission.safeParse({ source: 'form', form: { legalName: 'Acme' } })
    expect(parsed.success).toBe(true)
  })

  it('stage events carry a valid stage name', () => {
    const parsed = StageEvent.safeParse({
      applicationId: '3f7c9d1e-8a2b-4c5d-9e6f-1a2b3c4d5e6f',
      stage: 'extraction',
      status: 'completed',
      seq: 1,
      at: '2026-07-13T00:00:00.000Z',
    })
    expect(parsed.success).toBe(true)
  })
})
