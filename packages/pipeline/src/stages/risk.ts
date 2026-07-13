import { RiskAssessment, type CitationCheck, type GuidelineChunk } from '@prism/contracts'
import riskFixture from '../../../../fixtures/risk-assessment.json'
import { knockedOut, type PipelineStage } from '../state'

/**
 * Deterministic post-check behind the <2% hallucination metric: every citation
 * the model produced must reference a chunk that was actually retrieved.
 * A failure here forces a human referral (enforced in the routing matrix).
 */
export function checkCitations(assessment: RiskAssessment, chunks: GuidelineChunk[]): CitationCheck {
  const known = new Set(chunks.map((c) => c.id))
  const cited = [
    ...assessment.riskFactors.flatMap((f) => f.citations),
    ...assessment.suggestedConditions.flatMap((c) => c.citations),
  ]
  const invalidCitations = [...new Set(cited.filter((id) => !known.has(id)))]
  return {
    valid: invalidCitations.length === 0,
    invalidCitations,
    hallucinationFlag: invalidCitations.length > 0,
  }
}

/** Stage 5 (LLM: Sonnet, citation-grounded). Real implementation: build-plan block ⑦. */
export const riskStage: PipelineStage = {
  name: 'risk_assessment',
  skipIf: knockedOut,
  async run(state, ctx) {
    if (!ctx.mockMode) {
      throw new Error('real Sonnet risk assessment not implemented yet (build-plan block ⑦) — run with MOCK_MODE=true')
    }
    if (!state.guidelines) throw new Error('risk assessment requires retrieved guidelines')
    const risk = RiskAssessment.parse(riskFixture)
    const citationCheck = checkCitations(risk, state.guidelines.chunks)
    return { ...state, risk, citationCheck }
  },
}
