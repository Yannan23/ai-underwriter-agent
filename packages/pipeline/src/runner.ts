import { type StageName } from '@prism/contracts'

import { type Stage, type StageContext } from './stage'

/** Thrown by a stage to pause the pipeline (e.g. RFI) — not a failure. */
export class PipelineHalt extends Error {
  constructor(
    readonly reason: 'awaiting_info',
    readonly detail: Record<string, unknown>
  ) {
    super(`pipeline halted: ${reason}`)
  }
}

export class StageFailure extends Error {
  constructor(
    readonly stage: string,
    override readonly cause: unknown
  ) {
    super(`stage ${stage} failed`)
  }
}

export interface PipelineRunResult {
  state: unknown
  halted?: { stage: StageName; reason: string; detail: Record<string, unknown> }
}

/**
 * Sequential runner: each stage's output feeds the next stage's input, with a
 * started/completed/failed/paused event emitted around every stage. A failed
 * stage parks the application for human pickup — never silently skipped.
 * Stage IO is typed loosely here; the real type safety lives in the Zod
 * validation each stage performs at its own boundary.
 */
export async function runPipeline(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stages: readonly Stage<any, any>[],
  initialInput: unknown,
  ctx: StageContext
): Promise<PipelineRunResult> {
  let input: unknown = initialInput

  for (const stage of stages) {
    if (stage.skipIf?.(input)) {
      ctx.emit({
        applicationId: ctx.applicationId,
        stage: stage.name,
        status: 'completed',
        detail: { skipped: true },
      })
      continue
    }
    ctx.emit({
      applicationId: ctx.applicationId,
      stage: stage.name,
      status: 'started',
    })
    if (ctx.stageDelayMs)
      await new Promise((resolve) => setTimeout(resolve, ctx.stageDelayMs))
    try {
      input = await stage.run(input, ctx)
      ctx.emit({
        applicationId: ctx.applicationId,
        stage: stage.name,
        status: 'completed',
      })
    } catch (cause) {
      if (cause instanceof PipelineHalt) {
        ctx.emit({
          applicationId: ctx.applicationId,
          stage: stage.name,
          status: 'paused',
          detail: cause.detail,
        })

        return {
          state: input,
          halted: {
            stage: stage.name,
            reason: cause.reason,
            detail: cause.detail,
          },
        }
      }
      ctx.emit({
        applicationId: ctx.applicationId,
        stage: stage.name,
        status: 'failed',
        detail: {
          message: cause instanceof Error ? cause.message : String(cause),
        },
      })
      throw new StageFailure(stage.name, cause)
    }
  }

  return { state: input }
}
