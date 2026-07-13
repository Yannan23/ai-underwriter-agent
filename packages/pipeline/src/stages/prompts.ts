import {
  type EligibilityResult,
  type ExtractedApplication,
  type GuidelineChunk,
  type RiskAssessment,
} from '@prism/contracts'

/** Prompt versions are recorded per decision (PRD §8.6) — bump on any wording change. */
export const RISK_PROMPT_VERSION = 'risk.v1'
export const DECISION_PROMPT_VERSION = 'decision.v1'

/** Stage 5 system prompt: citation-grounded assessment against retrieved chunks only. */
export const RISK_SYSTEM_PROMPT = `You are an underwriting assistant assessing a professional indemnity application. Assess the risk ONLY against the retrieved guideline chunks provided in the user message — they are the only underwriting rules that exist for this assessment.

Rules:
- Every risk factor must cite at least one chunk id from the provided set (the ids in square brackets).
- If the guidelines do not cover a relevant factor, list it in uncoveredFactors instead — never assess it from general knowledge.
- Each suggested condition must cite the chunk ids that warrant it.

Severity per factor: "low" means within appetite at standard terms; "medium" means acceptable only with conditions, loadings, or referral; "high" means outside appetite or delegated authority.
overallRiskTier: "low" when all factors are low; "medium" when any factor is medium or conditions are warranted; "high" when any factor is high.`

/** Stage 6 system prompt: the LLM recommends; deterministic code decides. */
export const DECISION_SYSTEM_PROMPT = `You are an underwriting assistant recommending a decision on a professional indemnity application. Recommend exactly one of: accept, accept_with_conditions, refer, or decline — based on the application summary, eligibility outcome, and risk assessment provided.

Your recommendation is advisory only — a deterministic decision engine makes the final call and every decline requires human sign-off.

Rules:
- Conditions must be concrete and actionable (e.g. "Impose a $10,000 excess"), each supported by the guideline chunk ids you list in citations.
- citations may only reference the provided chunk ids.
- Keep reasoning concise: a few sentences covering the deciding factors.`

function money(amount: number | null): string {
  return amount == null ? 'unknown' : `$${amount.toLocaleString('en-AU')}`
}

function claimsSummary(
  claims: ExtractedApplication['history']['claimsLast5Years']
): string {
  if (claims.length === 0) return 'none in the past 5 years'

  return claims
    .map(
      (c) =>
        `${c.year}: ${c.description}, ${money(c.amount)}${c.open ? ', open' : ''}`
    )
    .join('; ')
}

/** Compact, deterministic rendering of the extracted application for the Sonnet prompts. */
export function summarizeApplication(app: ExtractedApplication): string {
  const { business, cover, history } = app

  return [
    `Occupation: ${business.occupation} (class: ${business.occupationClass ?? 'unclassified'})`,
    `Annual fee income: ${money(business.annualFeeIncome)}`,
    `Activities: ${business.activitiesSplit.map((a) => `${a.activity} ${a.pct}%`).join(', ')}`,
    `Claims: ${claimsSummary(history.claimsLast5Years)}`,
    `Overseas exposure: US/Canada ${business.overseasExposure.usCanadaPct}%, other ${business.overseasExposure.otherPct}%`,
    `Limit requested: ${money(cover.limitRequested)}`,
  ].join('\n')
}

/** Chunks rendered as "[id] headingPath: text" — the only place citations can be copied from. */
function renderChunks(chunks: GuidelineChunk[]): string {
  return chunks
    .map((c) => `[${c.id}] ${c.headingPath.join(' > ')}: ${c.text}`)
    .join('\n')
}

/** Stage 5 user content: application summary + the retrieved chunks. */
export function buildRiskUserContent(
  app: ExtractedApplication,
  chunks: GuidelineChunk[]
): string {
  return `Application summary:\n${summarizeApplication(app)}\n\nRetrieved guideline chunks:\n${renderChunks(chunks)}`
}

/** Stage 6 user content: summary + eligibility outcome + risk assessment + citable chunk ids. */
export function buildDecisionUserContent(
  app: ExtractedApplication,
  eligibility: EligibilityResult,
  risk: RiskAssessment,
  chunks: GuidelineChunk[]
): string {
  const rules =
    eligibility.rulesFired.length === 0
      ? 'none'
      : eligibility.rulesFired
          .map((r) => `${r.ruleId} (${r.effect}): ${r.description}`)
          .join('; ')
  const factors = risk.riskFactors
    .map(
      (f) => `- [${f.severity}] ${f.factor} (cites ${f.citations.join(', ')})`
    )
    .join('\n')
  const uncovered =
    risk.uncoveredFactors.length === 0
      ? 'none'
      : risk.uncoveredFactors.join('; ')

  return [
    `Application summary:\n${summarizeApplication(app)}`,
    `Eligibility outcome: ${eligibility.outcome}\nRules fired: ${rules}`,
    `Risk assessment (overall tier: ${risk.overallRiskTier}):\n${factors}\nUncovered factors: ${uncovered}`,
    `Available guideline chunk ids: ${chunks.map((c) => c.id).join(', ')}`,
  ].join('\n\n')
}
