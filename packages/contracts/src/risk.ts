import { z } from 'zod'

/**
 * Stage 5 output (LLM: Sonnet). Every finding must cite retrieved chunk ids;
 * factors the guidelines don't cover go in uncoveredFactors — never filled from model memory.
 */
export const RiskAssessment = z.object({
  riskFactors: z.array(
    z.object({
      factor: z.string(),
      severity: z.enum(['low', 'medium', 'high']),
      citations: z.array(z.string()).min(1),
      rationale: z.string(),
    })
  ),
  overallRiskTier: z.enum(['low', 'medium', 'high']),
  uncoveredFactors: z.array(z.string()),
  suggestedConditions: z.array(
    z.object({ condition: z.string(), citations: z.array(z.string()) })
  ),
})
export type RiskAssessment = z.infer<typeof RiskAssessment>

/**
 * Deterministic post-check: every citation must exist in the retrieved set.
 * hallucinationFlag=true forces a human referral — this is the mechanical
 * definition behind the <2% hallucination metric (PRD §6 Stage 5).
 */
export const CitationCheck = z.object({
  valid: z.boolean(),
  invalidCitations: z.array(z.string()),
  hallucinationFlag: z.boolean(),
})
export type CitationCheck = z.infer<typeof CitationCheck>
