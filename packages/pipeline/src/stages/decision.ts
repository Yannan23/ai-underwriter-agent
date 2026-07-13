import { DecisionRecommendation } from '@prism/contracts'

import decisionFixture from '../../../../fixtures/decision-recommendation.json'
import { callStructured, MODELS } from '../llm/client'
import { knockedOut, type PipelineStage } from '../state'

import { buildDecisionUserContent, DECISION_SYSTEM_PROMPT } from './prompts'

/**
 * Stage 6, LLM half (Sonnet recommends). The deterministic half — combining
 * this with eligibility, risk tier, confidence, and the authority matrix —
 * lives in the routing stage.
 */
export const decisionStage: PipelineStage = {
  name: 'decision',
  skipIf: knockedOut,
  async run(state, ctx) {
    if (ctx.mockMode) {
      return {
        ...state,
        recommendation: DecisionRecommendation.parse(decisionFixture),
      }
    }
    if (!state.extraction)
      throw new Error('decision requires extraction output')
    if (!state.eligibility)
      throw new Error('decision requires eligibility output')
    if (!state.risk) throw new Error('decision requires risk assessment output')
    if (!state.guidelines)
      throw new Error('decision requires retrieved guidelines')

    const recommendation = await callStructured(DecisionRecommendation, {
      model: MODELS.reasoning,
      system: DECISION_SYSTEM_PROMPT,
      user: buildDecisionUserContent(
        state.extraction,
        state.eligibility,
        state.risk,
        state.guidelines.chunks
      ),
      // Headroom for adaptive thinking, which counts toward max_tokens on Sonnet.
      maxTokens: 8000,
      // Sonnet rejects non-default sampling parameters; 1 is the accepted default.
      temperature: 1,
      label: 'decision',
    })

    return { ...state, recommendation }
  },
}
