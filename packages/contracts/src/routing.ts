import { z } from 'zod'

/**
 * Stage 8 output (deterministic routing matrix, PRD §6 Stage 8).
 * auto_approve requires: eligibility pass + low risk + accept recommendation
 * + confidence ≥ threshold + within authority. Declines always route to a human.
 */
export const RoutingResult = z.object({
  route: z.enum(['auto_approve', 'refer', 'refer_senior']),
  reasons: z.array(z.string()),
})
export type RoutingResult = z.infer<typeof RoutingResult>
