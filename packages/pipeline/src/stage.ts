import type { StageEvent, StageName } from '@prism/contracts'

export interface StageContext {
  applicationId: string
  requestId: string
  /** true → LLM stages return typed fixtures instead of calling models. */
  mockMode: boolean
  emit: (event: Omit<StageEvent, 'seq' | 'at'>) => void
}

/**
 * One pipeline stage. Inputs and outputs are Zod-validated at the boundary by
 * each stage's implementation — the contracts package is the source of truth.
 */
export interface Stage<I, O> {
  name: StageName
  run(input: I, ctx: StageContext): Promise<O>
}
