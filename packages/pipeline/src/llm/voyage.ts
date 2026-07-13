// cspell:ignore voyageai
import { z } from 'zod'

/**
 * Embedding model (PRD §6): Voyage embeds both the guideline corpus and the
 * deterministic retrieval query. Pinned here for reproducibility; the env var
 * allows per-environment overrides, mirroring MODELS in client.ts.
 */
export const VOYAGE_MODEL = process.env.VOYAGE_MODEL ?? 'voyage-3.5-lite'

export const VOYAGE_EMBEDDINGS_URL = 'https://api.voyageai.com/v1/embeddings'

const VoyageEmbeddingsResponse = z.object({
  data: z.array(
    z.object({ index: z.number(), embedding: z.array(z.number()) })
  ),
})

export class EmbeddingCallError extends Error {
  constructor(
    readonly label: string,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(`[${label}] ${message}`, options)
  }
}

const MAX_ATTEMPTS = 4

/**
 * 429s honour Retry-After when present and otherwise back off in long steps —
 * Voyage rate limits are per-minute windows, so the short 5xx backoff would
 * burn every retry inside the same window and still fail.
 */
const backoffMs = (
  attempt: number,
  status: number,
  retryAfter: string | null
): number => {
  const retryAfterSeconds = Number(retryAfter)

  if (
    retryAfter !== null &&
    Number.isFinite(retryAfterSeconds) &&
    retryAfterSeconds > 0
  ) {
    return Math.min(retryAfterSeconds * 1000, 60_000)
  }
  if (status === 429) return 20_000 * attempt

  return 1000 * 4 ** (attempt - 1)
}

/**
 * Embeds a batch of texts via the Voyage REST API (fetch-based — the payload
 * is one POST, so no SDK needed). Returns one vector per input, in input
 * order. Retries on 429/5xx with backoff, mirroring the Anthropic client;
 * other statuses and malformed bodies fail fast.
 */
export async function embedTexts(
  texts: string[],
  label: string
): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY

  if (!apiKey) throw new EmbeddingCallError(label, 'VOYAGE_API_KEY is not set')

  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(VOYAGE_EMBEDDINGS_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: VOYAGE_MODEL, input: texts }),
    })

    if (response.ok) {
      const parsed = VoyageEmbeddingsResponse.safeParse(
        (await response.json()) as unknown
      )

      if (!parsed.success) {
        throw new EmbeddingCallError(
          label,
          'embeddings response failed schema validation',
          { cause: parsed.error }
        )
      }

      return [...parsed.data.data]
        .sort((a, b) => a.index - b.index)
        .map((item) => item.embedding)
    }

    const failure = new EmbeddingCallError(
      label,
      `embeddings call failed with status ${response.status}`
    )

    if (response.status !== 429 && response.status < 500) throw failure
    lastError = failure
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          backoffMs(
            attempt,
            response.status,
            response.headers.get('retry-after')
          )
        )
      )
    }
  }
  throw new EmbeddingCallError(label, `failed after ${MAX_ATTEMPTS} attempts`, {
    cause: lastError,
  })
}
