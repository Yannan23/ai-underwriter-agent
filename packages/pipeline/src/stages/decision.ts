import { DecisionRecommendation } from '@prism/contracts'

import decisionFixture from '../../../../fixtures/decision-recommendation.json'
import { knockedOut, type PipelineStage } from '../state'

/**
 * Stage 6, LLM half (Sonnet recommends). The deterministic half — combining
 * this with eligibility, risk tier, confidence, and the authority matrix —
 * lives in the routing stage. Real implementation: build-plan block ⑦.
 */
export const decisionStage: PipelineStage = {
  name: 'decision',
  skipIf: knockedOut,
  async run(state, ctx) {
    if (!ctx.mockMode) {
      throw new Error(
        'real Sonnet decision reasoning not implemented yet (build-plan block ⑦) — run with MOCK_MODE=true'
      )
    }

    return {
      ...state,
      recommendation: DecisionRecommendation.parse(decisionFixture),
    }
  },
}
