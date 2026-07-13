import { rating } from '@prism/config'
import { Quote, type ExtractedApplication, type RatingConfig } from '@prism/contracts'
import { knockedOut, type PipelineStage } from '../state'

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Stage 7: pure deterministic rating (PRD §6 Stage 7) — no model call anywhere
 * in pricing. Every factor is recorded in the breakdown for auditability.
 *
 *   technical = baseRate × revenueBandFactor × ILF × claimsLoading × excessCredit
 *   premium   = max(technical, minimumPremium)
 *   payable   = premium + GST + stampDuty(state)
 */
export function ratePremium(
  app: ExtractedApplication,
  applicationId: string,
  cfg: RatingConfig = rating,
): Quote {
  const cls = app.business.occupationClass
  const income = app.business.annualFeeIncome
  if (cls === null || income === null) throw new Error('pricing requires occupationClass and annualFeeIncome')

  const baseRate = cfg.baseRate[cls]
  const minimumPremium = cfg.minimumPremium[cls]
  if (baseRate === undefined || minimumPremium === undefined) {
    throw new Error(`no rating entries for occupation class ${cls}`)
  }

  const band = cfg.revenueBands.find((b) => b.upTo === null || income <= b.upTo) ?? cfg.revenueBands.at(-1)
  if (!band) throw new Error('rating config has no revenue bands')

  const limit = app.cover.limitRequested
  const ilfEntry = cfg.ilf.find((e) => limit <= e.limit) ?? cfg.ilf.at(-1)
  if (!ilfEntry) throw new Error('rating config has no ILF entries')

  const claimsCount = app.history.claimsLast5Years.length
  const claimsLoading = Math.min(1 + cfg.claimsLoadingPerClaim * claimsCount, cfg.maxClaimsLoading)

  const preferredExcess = app.cover.excessPreference ?? cfg.excessCredits[0]?.excess ?? 1000
  const excessEntry =
    [...cfg.excessCredits].reverse().find((e) => e.excess <= preferredExcess) ?? cfg.excessCredits[0]
  if (!excessEntry) throw new Error('rating config has no excess credits')

  const basePremium = round2(baseRate * band.factor)
  const technicalPremium = round2(basePremium * ilfEntry.factor * claimsLoading * excessEntry.factor)
  const minimumApplied = technicalPremium < minimumPremium
  const premium = minimumApplied ? minimumPremium : technicalPremium
  const gst = round2(premium * cfg.gstRate)
  const stampDuty = round2((premium + gst) * (cfg.stampDutyByState[app.insured.state] ?? 0.1))
  const payable = round2(premium + gst + stampDuty)

  return Quote.parse({
    applicationId,
    limit: ilfEntry.limit,
    excess: excessEntry.excess,
    conditions: [],
    premiumBreakdown: {
      baseRate,
      revenueBandFactor: band.factor,
      basePremium,
      limitFactor: ilfEntry.factor,
      claimsLoading,
      excessCredit: excessEntry.factor,
      technicalPremium,
      minimumPremium,
      minimumApplied,
      premium,
      gst,
      stampDuty,
      payable,
    },
    ratingTableVersion: cfg.version,
    validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  })
}

export const pricingStage: PipelineStage = {
  name: 'pricing',
  skipIf: knockedOut,
  async run(state, ctx) {
    if (!state.extraction) throw new Error('pricing requires extraction output')
    const quote = ratePremium(state.extraction, ctx.applicationId)
    if (state.recommendation?.recommendation === 'accept_with_conditions') {
      quote.conditions = state.recommendation.conditions
    }
    return { ...state, quote }
  },
}
