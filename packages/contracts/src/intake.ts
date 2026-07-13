import { z } from 'zod'

/** What the API accepts at POST /applications. Day 1: web form only; PDF intake is Day 2+. */
export const RawSubmission = z.object({
  source: z.literal('form'),
  /** Raw proposal-form answers as submitted — extraction normalises these, never trusts them. */
  form: z.record(z.unknown()),
})
export type RawSubmission = z.infer<typeof RawSubmission>

/** Stage 0 output (PRD §6 Stage 0). */
export const IntakeRecord = z.object({
  applicationId: z.string().uuid(),
  source: z.enum(['pdf', 'form']),
  documentRefs: z.array(z.string()),
  receivedAt: z.string().datetime(),
})
export type IntakeRecord = z.infer<typeof IntakeRecord>
