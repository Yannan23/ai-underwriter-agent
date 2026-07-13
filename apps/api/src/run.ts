import { randomUUID } from 'node:crypto'

import { type RfiRequest } from '@prism/contracts'
import {
  createStages,
  runPipeline,
  type PipelineState,
  type StageContext,
} from '@prism/pipeline'

import { appendEvent, finish, type ApplicationRecord } from './store'

const mockMode = process.env.MOCK_MODE === 'true'
// Mock stages are instant; a small pause per stage lets the demo progress view animate.
const stageDelayMs = Number(process.env.STAGE_DELAY_MS ?? (mockMode ? 350 : 0))

/** Fire-and-forget: progress streams over SSE, the result lands on the record. */
export function startPipeline(record: ApplicationRecord): void {
  record.status = 'extracting'
  const ctx: StageContext = {
    applicationId: record.id,
    requestId: randomUUID(),
    mockMode,
    stageDelayMs,
    emit: (event) => void appendEvent(record, event),
  }
  const input: PipelineState = { submission: record.submission }

  void (async () => {
    try {
      const run = await runPipeline(createStages(), input, ctx)
      const state = run.state as PipelineState

      if (run.halted) {
        finish(record, {
          status: 'awaiting_info',
          rfi: run.halted.detail.rfi as RfiRequest | undefined,
          eligibility: state.eligibility,
        })

        return
      }
      finish(record, {
        status:
          state.routing?.route === 'auto_approve'
            ? 'auto_approved'
            : 'referred',
        routing: state.routing,
        quote: state.quote,
        riskAssessment: state.risk,
        citationCheck: state.citationCheck,
        eligibility: state.eligibility,
      })
    } catch (err) {
      // A failed stage parks the application for human pickup — never silently skipped.
      finish(record, {
        status: record.status,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })()
}
