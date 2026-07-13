import { z } from 'zod'

export const RuleHit = z.object({
  ruleId: z.string(),
  ruleSetVersion: z.string(),
  description: z.string(),
  effect: z.enum(['knockout', 'refer']),
})
export type RuleHit = z.infer<typeof RuleHit>

/**
 * Stage 3 output (deterministic rules engine).
 * knockout → recommended-decline package routed to a human — never auto-declined.
 */
export const EligibilityResult = z.object({
  outcome: z.enum(['pass', 'knockout', 'refer']),
  rulesFired: z.array(RuleHit),
  ruleSetVersion: z.string(),
})
export type EligibilityResult = z.infer<typeof EligibilityResult>
