import { IntakeRecord } from '@prism/contracts'
import type { PipelineStage } from '../state'

export const intakeStage: PipelineStage = {
  name: 'intake',
  async run(state, ctx) {
    const intake = IntakeRecord.parse({
      applicationId: ctx.applicationId,
      source: state.submission.source,
      documentRefs: [],
      receivedAt: new Date().toISOString(),
    })
    return { ...state, intake }
  },
}
