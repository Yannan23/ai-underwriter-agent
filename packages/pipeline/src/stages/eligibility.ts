import { appetite } from '@prism/config'
import {
  type AppetiteConfig,
  type EligibilityResult,
  type ExtractedApplication,
  type RuleHit,
} from '@prism/contracts'

import { type PipelineStage } from '../state'

/**
 * Stage 3: versioned knockout/referral rules (PRD §6 Stage 3). Pure function —
 * no LLM anywhere near an eligibility decision. Knockouts become a
 * recommended-decline package for a human; they are never auto-declined.
 */
export function evaluateEligibility(
  app: ExtractedApplication,
  cfg: AppetiteConfig = appetite
): EligibilityResult {
  const hits: RuleHit[] = []
  const hit = (
    ruleId: string,
    description: string,
    effect: RuleHit['effect']
  ): void => {
    hits.push({ ruleId, ruleSetVersion: cfg.version, description, effect })
  }

  const cls = app.business.occupationClass

  if (cls === null || !cfg.occupationClassesInAppetite.includes(cls)) {
    hit(
      'OCC-01',
      `Occupation class ${cls ?? 'unclassified'} is outside appetite.`,
      'knockout'
    )
  }

  const income = app.business.annualFeeIncome

  if (income !== null) {
    if (income > cfg.maxAnnualFeeIncome) {
      hit(
        'SIZE-01',
        `Annual fee income $${income.toLocaleString()} exceeds the $${cfg.maxAnnualFeeIncome.toLocaleString()} cap.`,
        'knockout'
      )
    } else if (income >= cfg.referAnnualFeeIncomeFrom) {
      hit(
        'SIZE-02',
        `Annual fee income $${income.toLocaleString()} is in the referral band.`,
        'refer'
      )
    }
  }

  if (app.business.overseasExposure.usCanadaPct > cfg.maxUsCanadaPct) {
    hit(
      'JUR-01',
      `US/Canada exposure ${app.business.overseasExposure.usCanadaPct}% exceeds ${cfg.maxUsCanadaPct}%.`,
      'knockout'
    )
  }

  const claims = app.history.claimsLast5Years

  if (claims.length > cfg.maxClaimsIn5Years) {
    hit(
      'CLM-01',
      `${claims.length} claims in 5 years exceeds the maximum of ${cfg.maxClaimsIn5Years}.`,
      'knockout'
    )
  }
  if (
    claims.some((c) => c.amount !== null && c.amount > cfg.maxSingleClaimAmount)
  ) {
    hit(
      'CLM-02',
      `A single claim exceeds $${cfg.maxSingleClaimAmount.toLocaleString()}.`,
      'knockout'
    )
  }
  if (claims.some((c) => c.open)) {
    hit('CLM-03', 'An open claim exists.', 'knockout')
  }

  if (app.history.everDeclinedOrCancelled === true) {
    hit(
      'HIST-01',
      'Prior declinature or cancellation of insurance.',
      'knockout'
    )
  }
  if (app.history.insolvencyEvents === true) {
    hit(
      'SOLV-01',
      `Insolvency event within ${cfg.insolvencyLookbackYears} years.`,
      'knockout'
    )
  }
  if (app.history.knownCircumstances === true) {
    hit(
      'DISC-01',
      'Known circumstances that may give rise to a claim.',
      'knockout'
    )
  }

  const outcome = hits.some((h) => h.effect === 'knockout')
    ? 'knockout'
    : hits.length > 0
      ? 'refer'
      : 'pass'

  return { outcome, rulesFired: hits, ruleSetVersion: cfg.version }
}

export const eligibilityStage: PipelineStage = {
  name: 'eligibility',
  async run(state) {
    if (!state.extraction)
      throw new Error('eligibility requires extraction output')

    return { ...state, eligibility: evaluateEligibility(state.extraction) }
  },
}
