import { type PipelineStage } from '../state'

import { decisionStage } from './decision'
import { eligibilityStage } from './eligibility'
import { extractionStage } from './extraction'
import { intakeStage } from './intake'
import { pricingStage } from './pricing'
import { retrievalStage } from './retrieval'
import { riskStage } from './risk'
import { routingStage } from './routing'
import { validationStage } from './validation'

/** The 9-stage pipeline in execution order (PRD §4). */
export function createStages(): PipelineStage[] {
  return [
    intakeStage,
    extractionStage,
    validationStage,
    eligibilityStage,
    retrievalStage,
    riskStage,
    decisionStage,
    pricingStage,
    routingStage,
  ]
}

export { classifyOccupationMock } from './extraction'
export { evaluateEligibility } from './eligibility'
export { ratePremium } from './pricing'
export { checkCitations } from './risk'
export { minRequiredConfidence, routeApplication } from './routing'
export {
  CONFIDENCE_THRESHOLD,
  findValidationIssues,
  REQUIRED_FIELD_PATHS,
} from './validation'
