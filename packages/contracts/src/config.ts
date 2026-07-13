import { z } from 'zod'

import { OccupationClass } from './common'

/** Shape of appetite.v1.json — versioned knockout/referral thresholds (PRD §6 Stage 3). */
export const AppetiteConfig = z.object({
  version: z.string(),
  occupationClassesInAppetite: z.array(OccupationClass),
  maxAnnualFeeIncome: z.number(),
  /** Fee income above this (but under the cap) → refer, not knockout. */
  referAnnualFeeIncomeFrom: z.number(),
  maxUsCanadaPct: z.number(),
  maxClaimsIn5Years: z.number(),
  maxSingleClaimAmount: z.number(),
  insolvencyLookbackYears: z.number(),
})
export type AppetiteConfig = z.infer<typeof AppetiteConfig>

/** Shape of rating.v1.json — versioned rating tables (PRD §6 Stage 7). */
export const RatingConfig = z.object({
  version: z.string(),
  /** Base rate per occupation class (premium per $1M fee income, illustrative). */
  baseRate: z.record(z.string(), z.number()),
  /** Ascending bands; upTo=null means open-ended top band. */
  revenueBands: z.array(
    z.object({ upTo: z.number().nullable(), factor: z.number() })
  ),
  /** Increased limit factor table, ascending by limit. */
  ilf: z.array(z.object({ limit: z.number(), factor: z.number() })),
  claimsLoadingPerClaim: z.number(),
  maxClaimsLoading: z.number(),
  excessCredits: z.array(z.object({ excess: z.number(), factor: z.number() })),
  minimumPremium: z.record(z.string(), z.number()),
  gstRate: z.number(),
  stampDutyByState: z.record(z.string(), z.number()),
})
export type RatingConfig = z.infer<typeof RatingConfig>
