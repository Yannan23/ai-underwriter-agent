import type {
  CitationCheck,
  DecisionRecommendation,
  EligibilityResult,
  ExtractedApplication,
  GuidelineContext,
  IntakeRecord,
  Quote,
  RawSubmission,
  RiskAssessment,
  RoutingResult,
  ValidationResult,
} from '@prism/contracts'
import type { Stage } from './stage'

/**
 * Accumulating pipeline state: each stage reads what it needs from earlier
 * stages and adds its own contract-shaped output. The Zod contracts guard the
 * per-field shapes; this interface is just the composition.
 */
export interface PipelineState {
  submission: RawSubmission
  intake?: IntakeRecord
  extraction?: ExtractedApplication
  validation?: ValidationResult
  eligibility?: EligibilityResult
  guidelines?: GuidelineContext
  risk?: RiskAssessment
  citationCheck?: CitationCheck
  recommendation?: DecisionRecommendation
  quote?: Quote
  routing?: RoutingResult
}

export type PipelineStage = Stage<PipelineState, PipelineState>

/** Shared skip predicate: LLM/pricing stages don't run after a knockout — no tokens spent. */
export function knockedOut(state: PipelineState): boolean {
  return state.eligibility?.outcome === 'knockout'
}
