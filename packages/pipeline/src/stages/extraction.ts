import {
  AU_STATES,
  ExtractedApplication,
  type OccupationClass,
} from '@prism/contracts'

import extractedFixture from '../../../../fixtures/extracted-application.json'
import { type PipelineStage } from '../state'

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)))
    return Number(v)

  return undefined
}

/**
 * Mock stand-in for the second Haiku call (free text → controlled taxonomy).
 * Keyword-based so the offline demo still reacts to what you type — e.g.
 * "architect" lands out of appetite and demonstrates the knockout path.
 */
export function classifyOccupationMock(occupation: string): OccupationClass {
  const t = occupation.toLowerCase()
  const rules: [RegExp, OccupationClass][] = [
    [/software|\bit\b|developer|tech/, 'it_consultant'],
    [/account/, 'accountant'],
    [/bookkeep/, 'bookkeeper'],
    [/market|media|advertis|pr\b/, 'marketing_media'],
    [/train|educat|coach/, 'training_education'],
    [/architect/, 'architect'],
    [/engineer/, 'engineering_consultant'],
    [/real estate|property agent/, 'real_estate_agent'],
    [/health|physio|osteo|dietit/, 'allied_health'],
  ]

  for (const [re, cls] of rules) if (re.test(t)) return cls

  return 'management_consultant'
}

/**
 * Stage 1 (LLM: Haiku). Mock mode merges the typed fixture with whatever the
 * form actually said, so the demo responds to real input without a model call.
 * The real Haiku implementation lands in build-plan block ④.
 */
export const extractionStage: PipelineStage = {
  name: 'extraction',
  async run(state, ctx) {
    if (!ctx.mockMode) {
      throw new Error(
        'real Haiku extraction not implemented yet (build-plan block ④) — run with MOCK_MODE=true'
      )
    }
    const form = state.submission.form
    const base = ExtractedApplication.parse(extractedFixture)

    const occupation = asString(form.occupation) ?? base.business.occupation
    const stateCode = asString(form.state)?.toUpperCase()
    const abn = asString(form.abn)?.replace(/\s/g, '')
    const claimsCount = asNumber(form.claimsCount)

    const extraction = ExtractedApplication.parse({
      ...base,
      insured: {
        ...base.insured,
        legalName: asString(form.legalName) ?? base.insured.legalName,
        abn: abn && /^\d{11}$/.test(abn) ? abn : base.insured.abn,
        state: AU_STATES.includes(stateCode as (typeof AU_STATES)[number])
          ? stateCode
          : base.insured.state,
        yearsInPractice:
          asNumber(form.yearsInPractice) ?? base.insured.yearsInPractice,
      },
      business: {
        ...base.business,
        occupation,
        occupationClass: classifyOccupationMock(occupation),
        annualFeeIncome:
          asNumber(form.annualFeeIncome) ?? base.business.annualFeeIncome,
        staffCount: asNumber(form.staffCount) ?? base.business.staffCount,
        overseasExposure: {
          ...base.business.overseasExposure,
          usCanadaPct:
            asNumber(form.usCanadaPct) ??
            base.business.overseasExposure.usCanadaPct,
        },
      },
      cover: {
        ...base.cover,
        limitRequested:
          asNumber(form.limitRequested) ?? base.cover.limitRequested,
        excessPreference:
          asNumber(form.excessPreference) ?? base.cover.excessPreference,
      },
      history: {
        ...base.history,
        claimsLast5Years:
          claimsCount !== undefined
            ? Array.from({ length: claimsCount }, (_, i) => ({
                year: 2025 - i,
                description: 'Professional negligence allegation (mock)',
                amount: 45000,
                open: false,
              }))
            : base.history.claimsLast5Years,
      },
    })

    return { ...state, extraction }
  },
}
