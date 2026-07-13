import { z } from 'zod'
import { AuState, OccupationClass } from './common'

/** Stage 1 output (LLM: Haiku). Extraction only — the prompt forbids judgment or interpretation. */
export const ExtractedApplication = z.object({
  insured: z.object({
    legalName: z.string(),
    abn: z
      .string()
      .regex(/^\d{11}$/)
      .nullable(),
    state: AuState,
    yearsInPractice: z.number().nullable(),
  }),
  business: z.object({
    /** Free text as written on the form; classified into occupationClass by a second Haiku call. */
    occupation: z.string(),
    occupationClass: OccupationClass.nullable(),
    activitiesSplit: z.array(z.object({ activity: z.string(), pct: z.number() })),
    annualFeeIncome: z.number().nullable(),
    staffCount: z.number().nullable(),
    overseasExposure: z.object({ usCanadaPct: z.number(), otherPct: z.number() }),
  }),
  cover: z.object({
    /** Limit of indemnity requested. */
    limitRequested: z.number(),
    excessPreference: z.number().nullable(),
    /** ISO date or 'unlimited'. */
    retroactiveDate: z.string().nullable(),
  }),
  history: z.object({
    claimsLast5Years: z.array(
      z.object({
        year: z.number(),
        description: z.string(),
        amount: z.number().nullable(),
        open: z.boolean(),
      }),
    ),
    priorInsurance: z.boolean().nullable(),
    everDeclinedOrCancelled: z.boolean().nullable(),
    insolvencyEvents: z.boolean().nullable(),
    knownCircumstances: z.boolean().nullable(),
  }),
  /** Per-field confidence 0–1, keyed by dot-path (e.g. "business.annualFeeIncome"). */
  fieldConfidence: z.record(z.number().min(0).max(1)),
})
export type ExtractedApplication = z.infer<typeof ExtractedApplication>
