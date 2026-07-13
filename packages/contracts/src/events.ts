import { z } from 'zod'

export const STAGE_NAMES = [
  'intake',
  'extraction',
  'validation',
  'eligibility',
  'retrieval',
  'risk_assessment',
  'decision',
  'pricing',
  'routing',
] as const
export const StageName = z.enum(STAGE_NAMES)
export type StageName = z.infer<typeof StageName>

/** One SSE event per stage transition — the applicant progress UI and the audit trail share these. */
export const StageEvent = z.object({
  applicationId: z.string().uuid(),
  stage: StageName,
  status: z.enum(['started', 'completed', 'failed', 'paused']),
  seq: z.number().int().nonnegative(),
  at: z.string().datetime(),
  detail: z.record(z.unknown()).optional(),
})
export type StageEvent = z.infer<typeof StageEvent>
