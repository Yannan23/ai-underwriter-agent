import { type ExtractedApplication, type RoutingResult } from '@prism/contracts'

import { type PipelineState, type PipelineStage } from '../state'

import { REQUIRED_FIELD_PATHS } from './validation'

const CONFIDENCE_FLOOR = 0.85
const AUTHORITY_MAX_LIMIT = 2_000_000
const AUTHORITY_MAX_PREMIUM = 10_000

/** Day-1 composite-confidence proxy: minimum confidence across required fields. */
export function minRequiredConfidence(app: ExtractedApplication): number {
  return Math.min(
    ...REQUIRED_FIELD_PATHS.map((p) => app.fieldConfidence[p] ?? 1)
  )
}

/**
 * Stage 8: the deterministic routing matrix (PRD §6 Stage 8). The LLM
 * recommendation is one input among several — it cannot unilaterally accept
 * or decline, and every decline routes to a human.
 */
export function routeApplication(state: PipelineState): RoutingResult {
  const reasons: string[] = []

  if (state.eligibility?.outcome === 'knockout') {
    return {
      route: 'refer_senior',
      reasons: [
        'Eligibility knockout — recommended decline requires human sign-off.',
        ...state.eligibility.rulesFired
          .filter((r) => r.effect === 'knockout')
          .map((r) => r.description),
      ],
    }
  }

  if (state.citationCheck?.hallucinationFlag) {
    reasons.push(
      `Risk assessment cited unknown guideline chunks (${state.citationCheck.invalidCitations.join(', ')}) — citation validation failed.`
    )
  }
  if (state.risk?.overallRiskTier === 'high')
    reasons.push('Overall risk tier is high.')
  if (state.recommendation?.recommendation === 'decline')
    reasons.push('Model recommends decline — human sign-off required.')
  if (reasons.length > 0) return { route: 'refer_senior', reasons }

  if (state.eligibility?.outcome === 'refer') {
    reasons.push(
      ...state.eligibility.rulesFired
        .filter((r) => r.effect === 'refer')
        .map((r) => r.description)
    )
  }
  if (state.risk?.overallRiskTier === 'medium')
    reasons.push('Overall risk tier is medium.')
  if (
    state.recommendation?.recommendation === 'refer' ||
    state.recommendation?.recommendation === 'accept_with_conditions' ||
    (state.risk?.suggestedConditions.length ?? 0) > 0
  ) {
    reasons.push('Conditions or referral suggested by the assessment.')
  }
  if (state.extraction) {
    const confidence = minRequiredConfidence(state.extraction)

    if (confidence < CONFIDENCE_FLOOR)
      reasons.push(
        `Extraction confidence ${confidence.toFixed(2)} below ${CONFIDENCE_FLOOR}.`
      )
  }
  if (
    state.extraction &&
    state.extraction.cover.limitRequested > AUTHORITY_MAX_LIMIT
  ) {
    reasons.push(
      `Requested limit exceeds $${AUTHORITY_MAX_LIMIT.toLocaleString()} authority.`
    )
  }
  if (
    state.quote &&
    state.quote.premiumBreakdown.premium > AUTHORITY_MAX_PREMIUM
  ) {
    reasons.push(
      `Premium exceeds $${AUTHORITY_MAX_PREMIUM.toLocaleString()} authority.`
    )
  }
  if (reasons.length > 0) return { route: 'refer', reasons }

  return {
    route: 'auto_approve',
    reasons: [
      'Eligibility pass, low risk, accept recommendation, confidence and authority checks met.',
    ],
  }
}

export const routingStage: PipelineStage = {
  name: 'routing',
  async run(state) {
    return { ...state, routing: routeApplication(state) }
  },
}
