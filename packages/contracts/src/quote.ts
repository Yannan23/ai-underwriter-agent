import { z } from 'zod'

/** Full audit-friendly breakdown — every factor in the rating formula is recorded (PRD §6 Stage 7). */
export const PremiumBreakdown = z.object({
  baseRate: z.number(),
  revenueBandFactor: z.number(),
  basePremium: z.number(),
  limitFactor: z.number(),
  claimsLoading: z.number(),
  excessCredit: z.number(),
  technicalPremium: z.number(),
  minimumPremium: z.number(),
  minimumApplied: z.boolean(),
  premium: z.number(),
  gst: z.number(),
  stampDuty: z.number(),
  payable: z.number(),
})
export type PremiumBreakdown = z.infer<typeof PremiumBreakdown>

/** Stage 7 output (deterministic rating engine — no model call anywhere in pricing). */
export const Quote = z.object({
  applicationId: z.string().uuid(),
  limit: z.number(),
  excess: z.number(),
  conditions: z.array(z.string()),
  premiumBreakdown: PremiumBreakdown,
  ratingTableVersion: z.string(),
  validUntil: z.string().datetime(),
})
export type Quote = z.infer<typeof Quote>
