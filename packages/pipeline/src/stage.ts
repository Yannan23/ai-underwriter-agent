import type { StageEvent, StageName } from '@prism/contracts'

export interface StageContext {
  applicationId: string
  requestId: string
  /** true → LLM stages return typed fixtures instead of calling models. */
  mockMode: boolean
  /** Artificial pause before each stage (demo pacing in mock mode). */
  stageDelayMs?: number
  emit: (event: Omit<StageEvent, 'seq' | 'at'>) => void
}

/**
 * One pipeline stage. Inputs and outputs are Zod-validated at the boundary by
 * each stage's implementation — the contracts package is the source of truth.
 */
export interface Stage<I, O> {
  name: StageName
  /** true → stage is recorded as skipped without running (e.g. LLM stages after a knockout). */
  skipIf?: (input: I) => boolean
  run(input: I, ctx: StageContext): Promise<O>
}
