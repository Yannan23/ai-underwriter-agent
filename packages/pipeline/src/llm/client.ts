import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
// Match @anthropic-ai/sdk/helpers/zod (imports zod/v4). Using `zod` here can
// resolve to a different ZodType identity under some TS module graphs.
import type * as z from 'zod/v4'

/**
 * Model routing (PRD §5): Haiku for extraction/classification, Sonnet for
 * risk assessment and decision reasoning. IDs are pinned here and recorded
 * per decision for reproducibility; env vars allow per-environment overrides.
 */
export const MODELS = {
  fast: process.env.ANTHROPIC_MODEL_FAST ?? 'claude-haiku-4-5',
  reasoning: process.env.ANTHROPIC_MODEL_REASONING ?? 'claude-sonnet-5',
} as const

let singleton: Anthropic | undefined

/** Lazily constructed so mock mode never requires an API key. */
export function getAnthropicClient(): Anthropic {
  return (singleton ??= new Anthropic())
}

/** Test hook: inject a fake client so unit tests never touch the network. */
export function setAnthropicClientForTests(
  client: Anthropic | undefined
): void {
  singleton = client
}

export interface StructuredCallOptions {
  /** One of MODELS.fast / MODELS.reasoning. */
  model: string
  system: string
  user: string
  maxTokens?: number
  temperature?: number
  /** Names the call site in errors and logs, e.g. "extraction". */
  label: string
}

export class LlmCallError extends Error {
  constructor(
    readonly label: string,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(`[${label}] ${message}`, options)
  }
}

const MAX_ATTEMPTS = 3
const backoffMs = (attempt: number): number => 1000 * 4 ** (attempt - 1)

/**
 * One structured LLM call: schema-constrained output via the Messages API,
 * validated by Zod. Retries on rate limits / 5xx with backoff and once more
 * if the output fails schema parsing. Every stage's model call goes through
 * here — no stage talks to the SDK directly.
 */
export async function callStructured<Schema extends z.ZodType>(
  schema: Schema,
  opts: StructuredCallOptions
): Promise<z.infer<Schema>> {
  const client = getAnthropicClient()
  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await client.messages.parse({
        model: opts.model,
        max_tokens: opts.maxTokens ?? 4000,
        temperature: opts.temperature ?? 0,
        // Stable prefix is cached (PRD §12 cost controls); volatile content
        // (the proposal document, retrieved chunks) belongs in `user`.
        system: [
          {
            type: 'text',
            text: opts.system,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [{ role: 'user', content: opts.user }],
        output_config: { format: zodOutputFormat(schema) },
      })

      if (response.parsed_output == null) {
        lastError = new LlmCallError(
          opts.label,
          'model output failed schema parsing'
        )
        continue
      }

      return schema.parse(response.parsed_output)
    } catch (error) {
      lastError = error
      const retryable =
        error instanceof Anthropic.RateLimitError ||
        (error instanceof Anthropic.APIError &&
          typeof error.status === 'number' &&
          error.status >= 500)

      if (!retryable) {
        throw new LlmCallError(opts.label, 'model call failed', {
          cause: error,
        })
      }
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs(attempt)))
      }
    }
  }
  throw new LlmCallError(opts.label, `failed after ${MAX_ATTEMPTS} attempts`, {
    cause: lastError,
  })
}
