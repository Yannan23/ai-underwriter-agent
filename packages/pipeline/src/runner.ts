import type { Stage, StageContext } from './stage'

export class StageFailure extends Error {
  constructor(
    readonly stage: string,
    readonly cause: unknown,
  ) {
    super(`stage ${stage} failed`)
  }
}

/**
 * Sequential runner: each stage's output feeds the next stage's input, with a
 * started/completed/failed event emitted around every stage. A failed stage
 * parks the application for human pickup — it is never silently skipped.
 * Stage IO is typed loosely here; the real type safety lives in the Zod
 * validation each stage performs at its own boundary.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runPipeline(
  stages: ReadonlyArray<Stage<any, any>>,
  initialInput: unknown,
  ctx: StageContext,
): Promise<unknown> {
  let input: unknown = initialInput
  for (const stage of stages) {
    ctx.emit({ applicationId: ctx.applicationId, stage: stage.name, status: 'started' })
    try {
      input = await stage.run(input, ctx)
      ctx.emit({ applicationId: ctx.applicationId, stage: stage.name, status: 'completed' })
    } catch (cause) {
      ctx.emit({
        applicationId: ctx.applicationId,
        stage: stage.name,
        status: 'failed',
        detail: { message: cause instanceof Error ? cause.message : String(cause) },
      })
      throw new StageFailure(stage.name, cause)
    }
  }
  return input
}
