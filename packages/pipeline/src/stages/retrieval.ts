import { GuidelineContext } from '@prism/contracts'
import guidelineFixture from '../../../../fixtures/guideline-context.json'
import { knockedOut, type PipelineStage } from '../state'

/**
 * Stage 4 (RAG). Mock mode returns a fixed mini-corpus context; the real
 * implementation (Voyage embeddings + in-memory cosine on Day 1, pgvector
 * later) lands in build-plan block ⑥. Skipped after a knockout.
 */
export const retrievalStage: PipelineStage = {
  name: 'retrieval',
  skipIf: knockedOut,
  async run(state, ctx) {
    if (!ctx.mockMode) {
      throw new Error('real guideline retrieval not implemented yet (build-plan block ⑥) — run with MOCK_MODE=true')
    }
    return { ...state, guidelines: GuidelineContext.parse(guidelineFixture) }
  },
}
