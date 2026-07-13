import type Anthropic from '@anthropic-ai/sdk'
import {
  ExtractedApplication,
  GuidelineContext,
  RiskAssessment,
  type EligibilityResult,
} from '@prism/contracts'
import { afterEach, describe, expect, test, vi } from 'vitest'

import decisionFixture from '../../../fixtures/decision-recommendation.json'
import extractedFixture from '../../../fixtures/extracted-application.json'
import guidelineFixture from '../../../fixtures/guideline-context.json'
import riskFixture from '../../../fixtures/risk-assessment.json'
import { MODELS, setAnthropicClientForTests } from '../src/llm/client'
import { type StageContext } from '../src/stage'
import { decisionStage } from '../src/stages/decision'
import {
  buildDecisionUserContent,
  buildRiskUserContent,
  DECISION_PROMPT_VERSION,
  RISK_PROMPT_VERSION,
} from '../src/stages/prompts'
import { riskStage } from '../src/stages/risk'
import { type PipelineState } from '../src/state'

const app = ExtractedApplication.parse(extractedFixture)
const guidelines = GuidelineContext.parse(guidelineFixture)
const risk = RiskAssessment.parse(riskFixture)
const eligibility: EligibilityResult = {
  outcome: 'pass',
  rulesFired: [],
  ruleSetVersion: 'pi-rules.v1',
}

const realCtx: StageContext = {
  applicationId: '3f7c9d1e-8a2b-4c5d-9e6f-1a2b3c4d5e6f',
  requestId: 'req-test',
  mockMode: false,
  emit: () => undefined,
}

interface CapturedRequest {
  model: string
  system: { text: string }[]
  messages: { content: string }[]
}

function inject(parse: ReturnType<typeof vi.fn>): ReturnType<typeof vi.fn> {
  setAnthropicClientForTests({ messages: { parse } } as unknown as Anthropic)

  return parse
}

function capturedRequest(parse: ReturnType<typeof vi.fn>): CapturedRequest {
  return parse.mock.calls[0]?.[0] as CapturedRequest
}

afterEach(() => {
  setAnthropicClientForTests(undefined)
})

describe('riskStage real path', () => {
  const state: PipelineState = {
    submission: { source: 'form', form: {} },
    extraction: app,
    guidelines,
  }

  test('calls Sonnet with the risk prompt and stores assessment plus citation check', async () => {
    const parse = inject(
      vi.fn().mockResolvedValue({ parsed_output: riskFixture })
    )
    const result = await riskStage.run(state, realCtx)

    expect(result.risk).toEqual(risk)
    expect(result.citationCheck).toEqual({
      valid: true,
      invalidCitations: [],
      hallucinationFlag: false,
    })

    const request = capturedRequest(parse)

    expect(request.model).toBe(MODELS.reasoning)
    expect(request.system[0]?.text).toContain('uncoveredFactors')
    const user = request.messages[0]?.content ?? ''

    for (const chunk of guidelines.chunks) {
      expect(user).toContain(`[${chunk.id}]`)
      expect(user).toContain(chunk.text)
    }
    expect(user).toContain(app.business.occupation)
    expect(user).toContain('Annual fee income: $850,000')
    expect(user).toContain('Limit requested: $1,000,000')
  })

  test('flags an invalid citation without throwing — routing handles it', async () => {
    const hallucinated = {
      ...risk,
      riskFactors: [{ ...risk.riskFactors[0], citations: ['gl-v9-999'] }],
    }

    inject(vi.fn().mockResolvedValue({ parsed_output: hallucinated }))
    const result = await riskStage.run(state, realCtx)

    expect(result.citationCheck).toEqual({
      valid: false,
      invalidCitations: ['gl-v9-999'],
      hallucinationFlag: true,
    })
    expect(result.risk?.riskFactors[0]?.citations).toEqual(['gl-v9-999'])
  })

  test('requires extraction output', async () => {
    inject(vi.fn())

    await expect(
      riskStage.run({ ...state, extraction: undefined }, realCtx)
    ).rejects.toThrow('risk assessment requires extraction output')
  })
})

describe('decisionStage real path', () => {
  const state: PipelineState = {
    submission: { source: 'form', form: {} },
    extraction: app,
    eligibility,
    risk,
    guidelines,
  }

  test('calls Sonnet with the decision prompt and stores the recommendation', async () => {
    const parse = inject(
      vi.fn().mockResolvedValue({ parsed_output: decisionFixture })
    )
    const result = await decisionStage.run(state, realCtx)

    expect(result.recommendation).toEqual(decisionFixture)

    const request = capturedRequest(parse)

    expect(request.model).toBe(MODELS.reasoning)
    expect(request.system[0]?.text).toContain('advisory')
    const user = request.messages[0]?.content ?? ''

    expect(user).toContain(app.business.occupation)
    expect(user).toContain('Eligibility outcome: pass')
    expect(user).toContain('Rules fired: none')
    expect(user).toContain('overall tier: low')
    expect(user).toContain(
      `Available guideline chunk ids: ${guidelines.chunks.map((c) => c.id).join(', ')}`
    )
  })

  test.each([
    [{}, 'decision requires extraction output'],
    [{ extraction: app }, 'decision requires eligibility output'],
    [
      { extraction: app, eligibility },
      'decision requires risk assessment output',
    ],
    [
      { extraction: app, eligibility, risk },
      'decision requires retrieved guidelines',
    ],
  ] as [Partial<PipelineState>, string][])(
    'guards missing inputs (%#)',
    async (partial, message) => {
      inject(vi.fn())

      await expect(
        decisionStage.run(
          { submission: { source: 'form', form: {} }, ...partial },
          realCtx
        )
      ).rejects.toThrow(message)
    }
  )
})

describe('prompt builders', () => {
  test('prompt versions are pinned', () => {
    expect(RISK_PROMPT_VERSION).toBe('risk.v1')
    expect(DECISION_PROMPT_VERSION).toBe('decision.v1')
  })

  test('renders unknown fields, open claims, and missing amounts explicitly', () => {
    const sparse = ExtractedApplication.parse({
      ...app,
      business: {
        ...app.business,
        occupationClass: null,
        annualFeeIncome: null,
      },
      history: {
        ...app.history,
        claimsLast5Years: [
          {
            year: 2024,
            description: 'negligence claim',
            amount: 45000,
            open: false,
          },
          { year: 2023, description: 'fee dispute', amount: null, open: true },
        ],
      },
    })
    const content = buildRiskUserContent(sparse, guidelines.chunks)

    expect(content).toContain('class: unclassified')
    expect(content).toContain('Annual fee income: unknown')
    expect(content).toContain('2024: negligence claim, $45,000')
    expect(content).toContain('2023: fee dispute, unknown, open')
  })

  test('renders fired rules and an empty uncovered-factors list', () => {
    const referred: EligibilityResult = {
      outcome: 'refer',
      rulesFired: [
        {
          ruleId: 'SIZE-02',
          ruleSetVersion: 'pi-rules.v1',
          description: 'Fee income in referral band',
          effect: 'refer',
        },
      ],
      ruleSetVersion: 'pi-rules.v1',
    }
    const content = buildDecisionUserContent(
      app,
      referred,
      { ...risk, uncoveredFactors: [] },
      guidelines.chunks
    )

    expect(content).toContain('Eligibility outcome: refer')
    expect(content).toContain('SIZE-02 (refer): Fee income in referral band')
    expect(content).toContain('Uncovered factors: none')
  })
})
