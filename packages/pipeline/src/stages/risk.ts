import {
  RiskAssessment,
  type CitationCheck,
  type ExtractedApplication,
  type GuidelineChunk,
} from '@prism/contracts'

import riskFixture from '../../../../fixtures/risk-assessment.json'
import { callStructured, MODELS } from '../llm/client'
import { knockedOut, type PipelineStage } from '../state'

import { buildRiskUserContent, RISK_SYSTEM_PROMPT } from './prompts'

/**
 * Deterministic post-check behind the <2% hallucination metric: every citation
 * the model produced must reference a chunk that was actually retrieved.
 * A failure here forces a human referral (enforced in the routing matrix).
 */
export function checkCitations(
  assessment: RiskAssessment,
  chunks: GuidelineChunk[]
): CitationCheck {
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

/** Real Stage 5 call: Sonnet assesses against the retrieved chunks only. */
async function assessRisk(
  extraction: ExtractedApplication | undefined,
  chunks: GuidelineChunk[]
): Promise<RiskAssessment> {
  if (!extraction) throw new Error('risk assessment requires extraction output')

  return callStructured(RiskAssessment, {
    model: MODELS.reasoning,
    system: RISK_SYSTEM_PROMPT,
    user: buildRiskUserContent(extraction, chunks),
    // Headroom for adaptive thinking, which counts toward max_tokens on Sonnet.
    maxTokens: 8000,
    // Sonnet rejects non-default sampling parameters; 1 is the accepted default.
    temperature: 1,
    label: 'risk_assessment',
  })
}

/**
 * Stage 5 (LLM: Sonnet, citation-grounded). A hallucinationFlag from the
 * post-check never throws — the routing matrix turns it into a referral.
 */
export const riskStage: PipelineStage = {
  name: 'risk_assessment',
  skipIf: knockedOut,
  async run(state, ctx) {
    if (!state.guidelines)
      throw new Error('risk assessment requires retrieved guidelines')
    const risk = ctx.mockMode
      ? RiskAssessment.parse(riskFixture)
      : await assessRisk(state.extraction, state.guidelines.chunks)
    const citationCheck = checkCitations(risk, state.guidelines.chunks)

    return { ...state, risk, citationCheck }
  },
}
