import { GuidelineContext } from '@prism/contracts'

import guidelineFixture from '../../../../fixtures/guideline-context.json'
import { retrieveGuidelines } from '../corpus/retrieve'
import { knockedOut, type PipelineStage } from '../state'

/**
 * Stage 4 (RAG). Mock mode returns a fixed mini-corpus context. Real mode
 * embeds the authored guideline corpus with Voyage once per process, builds a
 * deterministic query from the extracted application, and ranks chunks with
 * in-memory cosine top-6 (pgvector + rerank is Day 2+). Skipped after a
 * knockout.
 */
export const retrievalStage: PipelineStage = {
  name: 'retrieval',
  skipIf: knockedOut,
  async run(state, ctx) {
    if (ctx.mockMode) {
      return { ...state, guidelines: GuidelineContext.parse(guidelineFixture) }
    }
    if (!state.extraction) {
      throw new Error('retrieval requires extraction output')
    }

    return { ...state, guidelines: await retrieveGuidelines(state.extraction) }
  },
}
