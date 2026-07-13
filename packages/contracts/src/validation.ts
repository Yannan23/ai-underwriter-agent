import { z } from 'zod'

import { ExtractedApplication } from './extraction'

export const ValidationIssue = z.object({
  /** Dot-path of the offending field, e.g. "business.annualFeeIncome". */
  path: z.string(),
  code: z.enum(['missing', 'invalid', 'low_confidence']),
  message: z.string(),
})
export type ValidationIssue = z.infer<typeof ValidationIssue>

/** Templated Request-for-Information sent back to the broker; pipeline pauses (awaiting_info). */
export const RfiRequest = z.object({
  applicationId: z.string().uuid(),
  items: z.array(ValidationIssue).min(1),
  message: z.string(),
})
export type RfiRequest = z.infer<typeof RfiRequest>

/** Stage 2 output (deterministic, no LLM): either a validated application or an RFI. */
export const ValidationResult = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('valid'), application: ExtractedApplication }),
  z.object({ outcome: z.literal('rfi'), rfi: RfiRequest }),
])
export type ValidationResult = z.infer<typeof ValidationResult>
