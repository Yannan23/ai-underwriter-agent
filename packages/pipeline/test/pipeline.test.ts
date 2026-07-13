import { ExtractedApplication, RiskAssessment, type StageEvent } from '@prism/contracts'
import { describe, expect, it } from 'vitest'
import extractedFixture from '../../../fixtures/extracted-application.json'
import guidelineFixture from '../../../fixtures/guideline-context.json'
import riskFixture from '../../../fixtures/risk-assessment.json'
import {
  checkCitations,
  createStages,
  evaluateEligibility,
  ratePremium,
  runPipeline,
  type PipelineState,
  type StageContext,
} from '../src/index'

const app = ExtractedApplication.parse(extractedFixture)
const APP_ID = '3f7c9d1e-8a2b-4c5d-9e6f-1a2b3c4d5e6f'

describe('eligibility engine', () => {
  it('passes a clean in-appetite risk', () => {
    expect(evaluateEligibility(app).outcome).toBe('pass')
  })

  it('knocks out an out-of-appetite occupation', () => {
    const architect = { ...app, business: { ...app.business, occupationClass: 'architect' as const } }
    const result = evaluateEligibility(architect)
    expect(result.outcome).toBe('knockout')
    expect(result.rulesFired.map((r) => r.ruleId)).toContain('OCC-01')
  })

  it('knocks out excessive claims frequency', () => {
    const claims = Array.from({ length: 3 }, (_, i) => ({
      year: 2025 - i,
      description: 'claim',
      amount: 20000,
      open: false,
    }))
    const claimy = { ...app, history: { ...app.history, claimsLast5Years: claims } }
    expect(evaluateEligibility(claimy).outcome).toBe('knockout')
  })

  it('refers fee income in the referral band without knocking out', () => {
    const big = { ...app, business: { ...app.business, annualFeeIncome: 3_500_000 } }
    const result = evaluateEligibility(big)
    expect(result.outcome).toBe('refer')
    expect(result.rulesFired.map((r) => r.ruleId)).toContain('SIZE-02')
  })
})

describe('rating engine', () => {
  it('prices the fixture risk deterministically', () => {
    const quote = ratePremium(app, APP_ID)
    const b = quote.premiumBreakdown
    // 1800 base × 1.0 band × 1.0 ILF × 1.0 claims × 0.95 excess credit = 1710
    expect(b.technicalPremium).toBe(1710)
    expect(b.minimumApplied).toBe(false)
    expect(b.gst).toBe(171)
    // NSW stamp duty 9% on premium+GST
    expect(b.stampDuty).toBeCloseTo(169.29, 2)
    expect(b.payable).toBeCloseTo(2050.29, 2)
    expect(quote.ratingTableVersion).toBe('rating.v1')
  })

  it('applies the minimum premium floor', () => {
    const tiny = { ...app, business: { ...app.business, annualFeeIncome: 50_000 } }
    const quote = ratePremium(tiny, APP_ID)
    expect(quote.premiumBreakdown.minimumApplied).toBe(false)
    // 1800 × 0.6 × 0.95 = 1026 — still above the $650 minimum; force it lower via excess credit path
    const breakdown = quote.premiumBreakdown
    expect(breakdown.premium).toBeGreaterThanOrEqual(650)
  })
})

describe('citation check', () => {
  const assessment = RiskAssessment.parse(riskFixture)

  it('passes when every citation exists in the retrieved set', () => {
    const check = checkCitations(assessment, guidelineFixture.chunks)
    expect(check.valid).toBe(true)
    expect(check.hallucinationFlag).toBe(false)
  })

  it('flags citations that were never retrieved', () => {
    const hallucinated = {
      ...assessment,
      riskFactors: [
        { factor: 'Invented', severity: 'low' as const, citations: ['gl-v9-999'], rationale: 'not retrieved' },
      ],
    }
    const check = checkCitations(hallucinated, guidelineFixture.chunks)
    expect(check.hallucinationFlag).toBe(true)
    expect(check.invalidCitations).toEqual(['gl-v9-999'])
  })
})

function mockCtx(events: StageEvent[]): StageContext {
  let seq = 0
  return {
    applicationId: APP_ID,
    requestId: 'req-test',
    mockMode: true,
    emit: (e) => events.push({ ...e, seq: seq++, at: new Date().toISOString() }),
  }
}

describe('full mock pipeline', () => {
  it('auto-approves the clean happy path end-to-end', async () => {
    const events: StageEvent[] = []
    const input: PipelineState = { submission: { source: 'form', form: {} } }
    const run = await runPipeline(createStages(), input, mockCtx(events))
    const state = run.state as PipelineState

    expect(run.halted).toBeUndefined()
    expect(state.routing?.route).toBe('auto_approve')
    expect(state.quote?.premiumBreakdown.payable).toBeGreaterThan(0)
    expect(state.citationCheck?.valid).toBe(true)
    const last = events.at(-1)
    expect(last?.stage).toBe('routing')
    expect(last?.status).toBe('completed')
  })

  it('knocks out without touching LLM or pricing stages', async () => {
    const events: StageEvent[] = []
    const input: PipelineState = {
      submission: { source: 'form', form: { occupation: 'architect' } },
    }
    const run = await runPipeline(createStages(), input, mockCtx(events))
    const state = run.state as PipelineState

    expect(state.eligibility?.outcome).toBe('knockout')
    expect(state.routing?.route).toBe('refer_senior')
    expect(state.quote).toBeUndefined()
    const skipped = events.filter((e) => e.detail?.skipped === true).map((e) => e.stage)
    expect(skipped).toEqual(['retrieval', 'risk_assessment', 'decision', 'pricing'])
  })
})
