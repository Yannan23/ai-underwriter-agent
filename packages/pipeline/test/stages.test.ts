import type Anthropic from '@anthropic-ai/sdk'
import { rating } from '@prism/config'
import {
  DecisionRecommendation,
  ExtractedApplication,
  RiskAssessment,
  type StageEvent,
} from '@prism/contracts'
import { describe, expect, test } from 'vitest'

import decisionFixture from '../../../fixtures/decision-recommendation.json'
import extractedFixture from '../../../fixtures/extracted-application.json'
import riskFixture from '../../../fixtures/risk-assessment.json'
import {
  classifyOccupationMock,
  evaluateEligibility,
  findValidationIssues,
  minRequiredConfidence,
  PipelineHalt,
  ratePremium,
  routeApplication,
  runPipeline,
  setAnthropicClientForTests,
  StageFailure,
  type PipelineState,
  type Stage,
  type StageContext,
} from '../src/index'
import { decisionStage } from '../src/stages/decision'
import { eligibilityStage } from '../src/stages/eligibility'
import { extractionStage } from '../src/stages/extraction'
import { pricingStage } from '../src/stages/pricing'
import { retrievalStage } from '../src/stages/retrieval'
import { riskStage } from '../src/stages/risk'
import { validationStage } from '../src/stages/validation'

const app = ExtractedApplication.parse(extractedFixture)
const APP_ID = '3f7c9d1e-8a2b-4c5d-9e6f-1a2b3c4d5e6f'

function mockCtx(
  events: StageEvent[] = [],
  overrides: Partial<StageContext> = {}
): StageContext {
  let seq = 0

  return {
    applicationId: APP_ID,
    requestId: 'req-test',
    mockMode: true,
    emit: (e) =>
      events.push({ ...e, seq: seq++, at: new Date().toISOString() }),
    ...overrides,
  }
}

describe('runner halt and failure paths', () => {
  const submission = { source: 'form' as const, form: {} }

  test('a PipelineHalt pauses the run and emits a paused event', async () => {
    const halting: Stage<PipelineState, PipelineState> = {
      name: 'validation',
      run: () => {
        throw new PipelineHalt('awaiting_info', { rfi: { items: [] } })
      },
    }
    const events: StageEvent[] = []
    const run = await runPipeline([halting], { submission }, mockCtx(events))

    expect(run.halted).toEqual({
      stage: 'validation',
      reason: 'awaiting_info',
      detail: { rfi: { items: [] } },
    })
    expect(events.at(-1)?.status).toBe('paused')
  })

  test('a stage error is wrapped in StageFailure and emits a failed event', async () => {
    const failing: Stage<PipelineState, PipelineState> = {
      name: 'extraction',
      run: () => {
        throw new Error('model unavailable')
      },
    }
    const events: StageEvent[] = []
    const promise = runPipeline([failing], { submission }, mockCtx(events))

    await expect(promise).rejects.toThrow('stage extraction failed')
    await expect(promise).rejects.toBeInstanceOf(StageFailure)
    expect(events.at(-1)?.status).toBe('failed')
    expect(events.at(-1)?.detail).toEqual({ message: 'model unavailable' })
  })

  test('a non-Error throw is stringified in the failed event', async () => {
    const failing: Stage<PipelineState, PipelineState> = {
      name: 'extraction',
      run: () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- exercising the defensive String(cause) path
        throw 'boom'
      },
    }
    const events: StageEvent[] = []
    const promise = runPipeline([failing], { submission }, mockCtx(events))

    await expect(promise).rejects.toBeInstanceOf(StageFailure)
    expect(events.at(-1)?.detail).toEqual({ message: 'boom' })
  })

  test('honours stageDelayMs between stages', async () => {
    const noop: Stage<PipelineState, PipelineState> = {
      name: 'intake',
      run: (input) => Promise.resolve(input),
    }
    const run = await runPipeline(
      [noop],
      { submission },
      mockCtx([], { stageDelayMs: 1 })
    )

    expect(run.halted).toBeUndefined()
  })
})

describe('validation stage', () => {
  test('reports every kind of issue', () => {
    const broken = ExtractedApplication.parse({
      ...app,
      business: {
        ...app.business,
        annualFeeIncome: null,
        occupationClass: null,
        activitiesSplit: [{ activity: 'consulting', pct: 60 }],
      },
      fieldConfidence: { 'insured.legalName': 0.5 },
    })
    const issues = findValidationIssues(broken)
    const codes = issues.map((i) => i.code)

    expect(codes).toContain('missing')
    expect(codes).toContain('invalid')
    expect(codes).toContain('low_confidence')
  })

  test('halts the pipeline with an RFI when issues exist', async () => {
    const missingIncome = ExtractedApplication.parse({
      ...app,
      business: { ...app.business, annualFeeIncome: null },
    })
    const state: PipelineState = {
      submission: { source: 'form', form: {} },
      extraction: missingIncome,
    }

    await expect(validationStage.run(state, mockCtx())).rejects.toBeInstanceOf(
      PipelineHalt
    )
  })

  test('throws when extraction output is missing', async () => {
    const state: PipelineState = { submission: { source: 'form', form: {} } }

    await expect(validationStage.run(state, mockCtx())).rejects.toThrow(
      'validation requires extraction output'
    )
  })
})

describe('eligibility rules', () => {
  const withHistory = (
    history: Partial<(typeof app)['history']>
  ): ExtractedApplication => ({
    ...app,
    history: { ...app.history, ...history },
  })

  test('flags an unclassified occupation as out of appetite', () => {
    const unclassified = {
      ...app,
      business: { ...app.business, occupationClass: null },
    }
    const result = evaluateEligibility(unclassified)

    expect(result.rulesFired.map((r) => r.ruleId)).toContain('OCC-01')
  })

  test('skips income rules when fee income is unknown', () => {
    const unknownIncome = {
      ...app,
      business: { ...app.business, annualFeeIncome: null },
    }
    const ids = evaluateEligibility(unknownIncome).rulesFired.map(
      (r) => r.ruleId
    )

    expect(ids).not.toContain('SIZE-01')
    expect(ids).not.toContain('SIZE-02')
  })

  test('knocks out fee income above the cap', () => {
    const huge = {
      ...app,
      business: { ...app.business, annualFeeIncome: 6_000_000 },
    }
    const result = evaluateEligibility(huge)

    expect(result.outcome).toBe('knockout')
    expect(result.rulesFired.map((r) => r.ruleId)).toContain('SIZE-01')
  })

  test('knocks out excessive US/Canada exposure', () => {
    const usHeavy = {
      ...app,
      business: {
        ...app.business,
        overseasExposure: { usCanadaPct: 25, otherPct: 0 },
      },
    }

    expect(
      evaluateEligibility(usHeavy).rulesFired.map((r) => r.ruleId)
    ).toContain('JUR-01')
  })

  test('knocks out a single large claim but ignores claims with unknown amounts', () => {
    const result = evaluateEligibility(
      withHistory({
        claimsLast5Years: [
          { year: 2024, description: 'big', amount: 250_000, open: false },
          { year: 2023, description: 'unknown', amount: null, open: false },
        ],
      })
    )

    expect(result.rulesFired.map((r) => r.ruleId)).toContain('CLM-02')
  })

  test('knocks out an open claim', () => {
    const result = evaluateEligibility(
      withHistory({
        claimsLast5Years: [
          { year: 2024, description: 'pending', amount: 10_000, open: true },
        ],
      })
    )

    expect(result.rulesFired.map((r) => r.ruleId)).toContain('CLM-03')
  })

  test('knocks out prior declinature, insolvency, and known circumstances', () => {
    const ids = evaluateEligibility(
      withHistory({
        everDeclinedOrCancelled: true,
        insolvencyEvents: true,
        knownCircumstances: true,
      })
    ).rulesFired.map((r) => r.ruleId)

    expect(ids).toEqual(
      expect.arrayContaining(['HIST-01', 'SOLV-01', 'DISC-01'])
    )
  })

  test('the stage throws without extraction output', async () => {
    const state: PipelineState = { submission: { source: 'form', form: {} } }

    await expect(eligibilityStage.run(state, mockCtx())).rejects.toThrow(
      'eligibility requires extraction output'
    )
  })
})

describe('occupation classifier mock', () => {
  test('maps keywords to taxonomy classes', () => {
    expect(classifyOccupationMock('software development')).toBe('it_consultant')
    expect(classifyOccupationMock('chartered accountant')).toBe('accountant')
    expect(classifyOccupationMock('bookkeeping services')).toBe('bookkeeper')
    expect(classifyOccupationMock('marketing agency')).toBe('marketing_media')
    expect(classifyOccupationMock('corporate training')).toBe(
      'training_education'
    )
    expect(classifyOccupationMock('architect')).toBe('architect')
    expect(classifyOccupationMock('civil engineering consultancy')).toBe(
      'engineering_consultant'
    )
    expect(classifyOccupationMock('real estate sales')).toBe(
      'real_estate_agent'
    )
    expect(classifyOccupationMock('physio and allied health clinic')).toBe(
      'allied_health'
    )
    expect(classifyOccupationMock('florist')).toBe('management_consultant')
  })
})

describe('extraction stage', () => {
  test('takes the real Haiku path outside mock mode', async () => {
    // Inject a failing fake client: proves the stage routes to the LLM path
    // (and propagates its errors) without any network in unit tests.
    setAnthropicClientForTests({
      messages: { parse: () => Promise.reject(new Error('offline')) },
    } as unknown as Anthropic)
    try {
      const state: PipelineState = { submission: { source: 'form', form: {} } }

      await expect(
        extractionStage.run(state, mockCtx([], { mockMode: false }))
      ).rejects.toThrow('[extraction] model call failed')
    } finally {
      setAnthropicClientForTests(undefined)
    }
  })

  test('merges valid form values over the fixture base', async () => {
    const state: PipelineState = {
      submission: {
        source: 'form',
        form: {
          legalName: 'Acme Advisory Pty Ltd',
          abn: '51 824 753 556',
          state: 'vic',
          yearsInPractice: '12',
          occupation: 'chartered accountant',
          annualFeeIncome: '900000',
          staffCount: 6,
          usCanadaPct: 5,
          limitRequested: 2_000_000,
          excessPreference: 10_000,
          claimsCount: '1',
        },
      },
    }
    const result = await extractionStage.run(state, mockCtx())
    const extraction = result.extraction

    expect(extraction?.insured.legalName).toBe('Acme Advisory Pty Ltd')
    expect(extraction?.insured.abn).toBe('51824753556')
    expect(extraction?.insured.state).toBe('VIC')
    expect(extraction?.insured.yearsInPractice).toBe(12)
    expect(extraction?.business.occupationClass).toBe('accountant')
    expect(extraction?.business.annualFeeIncome).toBe(900_000)
    expect(extraction?.business.overseasExposure.usCanadaPct).toBe(5)
    expect(extraction?.cover.limitRequested).toBe(2_000_000)
    expect(extraction?.history.claimsLast5Years).toHaveLength(1)
  })

  test('falls back to the fixture for blank, malformed, or unknown values', async () => {
    const state: PipelineState = {
      submission: {
        source: 'form',
        form: {
          legalName: '   ',
          abn: '12345',
          state: 'ZZ',
          yearsInPractice: 'many',
          annualFeeIncome: Number.NaN,
          staffCount: '  ',
          occupation: 42,
        },
      },
    }
    const result = await extractionStage.run(state, mockCtx())
    const extraction = result.extraction

    expect(extraction?.insured.legalName).toBe(app.insured.legalName)
    expect(extraction?.insured.abn).toBe(app.insured.abn)
    expect(extraction?.insured.state).toBe(app.insured.state)
    expect(extraction?.insured.yearsInPractice).toBe(
      app.insured.yearsInPractice
    )
    expect(extraction?.business.annualFeeIncome).toBe(
      app.business.annualFeeIncome
    )
    expect(extraction?.business.occupation).toBe(app.business.occupation)
  })
})

describe('retrieval, risk, and decision stage guards', () => {
  const state: PipelineState = { submission: { source: 'form', form: {} } }

  test('retrieval throws outside mock mode', async () => {
    await expect(
      retrievalStage.run(state, mockCtx([], { mockMode: false }))
    ).rejects.toThrow('MOCK_MODE=true')
  })

  test('risk throws outside mock mode', async () => {
    await expect(
      riskStage.run(state, mockCtx([], { mockMode: false }))
    ).rejects.toThrow('MOCK_MODE=true')
  })

  test('risk requires retrieved guidelines', async () => {
    await expect(riskStage.run(state, mockCtx())).rejects.toThrow(
      'risk assessment requires retrieved guidelines'
    )
  })

  test('decision throws outside mock mode', async () => {
    await expect(
      decisionStage.run(state, mockCtx([], { mockMode: false }))
    ).rejects.toThrow('MOCK_MODE=true')
  })
})

describe('rating engine edge cases', () => {
  test('throws when class or income is missing', () => {
    const noClass = {
      ...app,
      business: { ...app.business, occupationClass: null },
    }
    const noIncome = {
      ...app,
      business: { ...app.business, annualFeeIncome: null },
    }

    expect(() => ratePremium(noClass, APP_ID)).toThrow(
      'pricing requires occupationClass and annualFeeIncome'
    )
    expect(() => ratePremium(noIncome, APP_ID)).toThrow(
      'pricing requires occupationClass and annualFeeIncome'
    )
  })

  test('throws for a class with no rating entries', () => {
    const architect = {
      ...app,
      business: { ...app.business, occupationClass: 'architect' as const },
    }

    expect(() => ratePremium(architect, APP_ID)).toThrow(
      'no rating entries for occupation class architect'
    )
  })

  test('falls back to the last revenue band and ILF entry when nothing matches', () => {
    const cfg = {
      ...rating,
      revenueBands: [{ upTo: 100_000, factor: 0.6 }],
      ilf: [{ limit: 500_000, factor: 1.0 }],
    }
    const quote = ratePremium(app, APP_ID, cfg)

    expect(quote.premiumBreakdown.revenueBandFactor).toBe(0.6)
    expect(quote.limit).toBe(500_000)
  })

  test('throws when the rating config has no bands, ILF entries, or excess credits', () => {
    expect(() =>
      ratePremium(app, APP_ID, { ...rating, revenueBands: [] })
    ).toThrow('rating config has no revenue bands')
    expect(() => ratePremium(app, APP_ID, { ...rating, ilf: [] })).toThrow(
      'rating config has no ILF entries'
    )
    const noExcessPreference = {
      ...app,
      cover: { ...app.cover, excessPreference: null },
    }

    expect(() =>
      ratePremium(noExcessPreference, APP_ID, { ...rating, excessCredits: [] })
    ).toThrow('rating config has no excess credits')
  })

  test('defaults to the smallest configured excess when no preference is given', () => {
    const noPreference = {
      ...app,
      cover: { ...app.cover, excessPreference: null },
    }
    const quote = ratePremium(noPreference, APP_ID)

    expect(quote.excess).toBe(1000)
    expect(quote.premiumBreakdown.excessCredit).toBe(1.0)
  })

  test('caps the claims loading at the configured maximum', () => {
    const claimHeavy = {
      ...app,
      history: {
        ...app.history,
        claimsLast5Years: Array.from({ length: 4 }, (_, i) => ({
          year: 2025 - i,
          description: 'claim',
          amount: 10_000,
          open: false,
        })),
      },
    }
    const quote = ratePremium(claimHeavy, APP_ID)

    expect(quote.premiumBreakdown.claimsLoading).toBe(rating.maxClaimsLoading)
  })

  test('applies the minimum premium floor and default stamp duty', () => {
    const cfg = {
      ...rating,
      minimumPremium: { ...rating.minimumPremium, management_consultant: 5000 },
      stampDutyByState: {},
    }
    const quote = ratePremium(app, APP_ID, cfg)
    const b = quote.premiumBreakdown

    expect(b.minimumApplied).toBe(true)
    expect(b.premium).toBe(5000)
    expect(b.stampDuty).toBeCloseTo((b.premium + b.gst) * 0.1, 2)
  })

  test('the stage throws without extraction and copies accepted conditions onto the quote', async () => {
    await expect(
      pricingStage.run({ submission: { source: 'form', form: {} } }, mockCtx())
    ).rejects.toThrow('pricing requires extraction output')

    const recommendation = DecisionRecommendation.parse({
      ...decisionFixture,
      recommendation: 'accept_with_conditions',
      conditions: ['Impose a $10,000 excess'],
    })
    const state: PipelineState = {
      submission: { source: 'form', form: {} },
      extraction: app,
      recommendation,
    }
    const result = await pricingStage.run(state, mockCtx())

    expect(result.quote?.conditions).toEqual(['Impose a $10,000 excess'])
  })
})

describe('routing matrix', () => {
  const risk = RiskAssessment.parse(riskFixture)
  const recommendation = DecisionRecommendation.parse(decisionFixture)
  const base: PipelineState = {
    submission: { source: 'form', form: {} },
    extraction: app,
    eligibility: evaluateEligibility(app),
    risk,
    recommendation,
  }

  test('auto-approves when no state is present to object', () => {
    const route = routeApplication({
      submission: { source: 'form', form: {} },
    })

    expect(route.route).toBe('auto_approve')
  })

  test('refers senior on citation hallucination', () => {
    const route = routeApplication({
      ...base,
      citationCheck: {
        valid: false,
        invalidCitations: ['gl-v9-999'],
        hallucinationFlag: true,
      },
    })

    expect(route.route).toBe('refer_senior')
    expect(route.reasons.join(' ')).toContain('gl-v9-999')
  })

  test('refers senior on a high risk tier or a decline recommendation', () => {
    const highRisk = routeApplication({
      ...base,
      risk: { ...risk, overallRiskTier: 'high' },
    })
    const decline = routeApplication({
      ...base,
      recommendation: { ...recommendation, recommendation: 'decline' },
    })

    expect(highRisk.route).toBe('refer_senior')
    expect(decline.route).toBe('refer_senior')
  })

  test('refers on an eligibility referral band', () => {
    const bigIncome = ExtractedApplication.parse({
      ...app,
      business: { ...app.business, annualFeeIncome: 3_500_000 },
    })
    const route = routeApplication({
      ...base,
      extraction: bigIncome,
      eligibility: evaluateEligibility(bigIncome),
    })

    expect(route.route).toBe('refer')
    expect(route.reasons.join(' ')).toContain('referral band')
  })

  test('refers on a medium risk tier', () => {
    const route = routeApplication({
      ...base,
      risk: { ...risk, overallRiskTier: 'medium' },
    })

    expect(route.route).toBe('refer')
  })

  test('refers when the model suggests conditions or referral', () => {
    const referRec = routeApplication({
      ...base,
      recommendation: { ...recommendation, recommendation: 'refer' },
    })
    const conditionsRec = routeApplication({
      ...base,
      recommendation: {
        ...recommendation,
        recommendation: 'accept_with_conditions',
      },
    })
    const suggested = routeApplication({
      ...base,
      risk: {
        ...risk,
        suggestedConditions: [
          {
            condition: 'Written engagement letters required',
            citations: ['gl-v1-001'],
          },
        ],
      },
    })

    expect(referRec.route).toBe('refer')
    expect(conditionsRec.route).toBe('refer')
    expect(suggested.route).toBe('refer')
  })

  test('refers on low extraction confidence, treating missing paths as confident', () => {
    const shaky = ExtractedApplication.parse({
      ...app,
      fieldConfidence: { 'insured.legalName': 0.7 },
    })

    expect(minRequiredConfidence(shaky)).toBe(0.7)
    const route = routeApplication({ ...base, extraction: shaky })

    expect(route.route).toBe('refer')
    expect(route.reasons.join(' ')).toContain('confidence')
  })

  test('refers above limit or premium authority', () => {
    const bigLimit = ExtractedApplication.parse({
      ...app,
      cover: { ...app.cover, limitRequested: 5_000_000 },
    })
    const overLimit = routeApplication({ ...base, extraction: bigLimit })

    expect(overLimit.route).toBe('refer')
    expect(overLimit.reasons.join(' ')).toContain('authority')

    const expensive = ratePremium(app, APP_ID, {
      ...rating,
      minimumPremium: {
        ...rating.minimumPremium,
        management_consultant: 20_000,
      },
    })
    const overPremium = routeApplication({ ...base, quote: expensive })

    expect(overPremium.route).toBe('refer')
    expect(overPremium.reasons.join(' ')).toContain('Premium exceeds')
  })
})
