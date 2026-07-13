import { z } from 'zod'

/**
 * Stage 6, LLM half (Sonnet). A recommendation only — the deterministic decision
 * engine combines it with eligibility outcome, risk tier, confidence, and the
 * authority matrix. The LLM cannot unilaterally accept or decline.
 */
export const DecisionRecommendation = z.object({
  recommendation: z.enum(['accept', 'accept_with_conditions', 'refer', 'decline']),
  conditions: z.array(z.string()),
  reasoning: z.string(),
  citations: z.array(z.string()),
})
export type DecisionRecommendation = z.infer<typeof DecisionRecommendation>
