import {
  RfiRequest,
  type ExtractedApplication,
  type ValidationIssue,
} from '@prism/contracts'

import { isValidAbn } from '../abn'
import { PipelineHalt } from '../runner'
import { type PipelineStage } from '../state'

export const CONFIDENCE_THRESHOLD = 0.8

/** Fields that must be present (and confidently extracted) before underwriting. */
export const REQUIRED_FIELD_PATHS = [
  'insured.legalName',
  'insured.state',
  'business.occupation',
  'business.occupationClass',
  'business.annualFeeIncome',
  'cover.limitRequested',
] as const

/**
 * Prefer the form value when the broker typed one — mock extraction used to
 * silently replace malformed ABNs with the fixture, which hid the error.
 */
function abnCandidate(
  app: ExtractedApplication,
  form: Record<string, unknown>
): string | null {
  const raw = form.abn

  if (typeof raw === 'string' && raw.trim() !== '') {
    return raw.replace(/\s/g, '')
  }

  return app.insured.abn
}

export function findValidationIssues(
  app: ExtractedApplication,
  form: Record<string, unknown> = {}
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const abn = abnCandidate(app, form)

  if (abn !== null && !isValidAbn(abn)) {
    issues.push({
      path: 'insured.abn',
      code: 'invalid',
      message:
        'ABN is not a valid 11-digit Australian Business Number — please confirm it.',
    })
  }
  if (app.business.annualFeeIncome === null) {
    issues.push({
      path: 'business.annualFeeIncome',
      code: 'missing',
      message: 'Annual fee income is required to rate the risk.',
    })
  }
  if (app.business.occupationClass === null) {
    issues.push({
      path: 'business.occupationClass',
      code: 'missing',
      message:
        'Occupation could not be classified — please describe the professional services performed.',
    })
  }
  const split = app.business.activitiesSplit

  if (split.length > 0) {
    const sum = split.reduce((s, a) => s + a.pct, 0)

    if (Math.abs(sum - 100) > 1) {
      issues.push({
        path: 'business.activitiesSplit',
        code: 'invalid',
        message: `Activity percentages sum to ${sum}%, expected 100%.`,
      })
    }
  }
  for (const path of REQUIRED_FIELD_PATHS) {
    const confidence = app.fieldConfidence[path]

    if (confidence !== undefined && confidence < CONFIDENCE_THRESHOLD) {
      issues.push({
        path,
        code: 'low_confidence',
        message: `Extracted value for ${path} is below the confidence threshold — please confirm it.`,
      })
    }
  }

  return issues
}

/** Stage 2 (deterministic, no LLM). Issues → templated RFI and the pipeline pauses. */
export const validationStage: PipelineStage = {
  name: 'validation',
  async run(state, ctx) {
    const app = state.extraction

    if (!app) throw new Error('validation requires extraction output')
    const issues = findValidationIssues(app, state.submission.form)

    if (issues.length > 0) {
      const rfi = RfiRequest.parse({
        applicationId: ctx.applicationId,
        items: issues,
        message:
          'We need a little more information before we can quote. Please provide the items listed.',
      })

      throw new PipelineHalt('awaiting_info', { rfi })
    }

    return {
      ...state,
      validation: { outcome: 'valid' as const, application: app },
    }
  },
}
