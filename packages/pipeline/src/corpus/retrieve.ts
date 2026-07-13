import { GuidelineContext, type ExtractedApplication } from '@prism/contracts'

import { EmbeddingCallError, embedTexts } from '../llm/voyage'

import { loadGuidelineCorpus } from './index'

/** Day-1 scope: in-memory cosine top-k — pgvector + rerank is Day 2+ (PRD §6). */
export const TOP_K = 6

/**
 * Cosine similarity. Dimensions missing from `b` are treated as zero (only
 * reachable if the embedding API returns mismatched vectors); a zero-norm
 * vector scores 0 rather than dividing by zero.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0

  for (const [i, x] of a.entries()) {
    const y = b[i] ?? 0

    dot += x * y
    normA += x * x
    normB += y * y
  }
  const denominator = Math.sqrt(normA * normB)

  return denominator === 0 ? 0 : dot / denominator
}

const limitBand = (limit: number): string => {
  if (limit <= 1_000_000) return 'up to $1,000,000'
  if (limit <= 2_000_000) return '$1,000,001 to $2,000,000'

  return 'above $2,000,000'
}

/**
 * Deterministic query construction (PRD §6): built only from occupationClass,
 * activities, claims profile, and limit band — never free-form model text —
 * so identical applications always retrieve identical guidance.
 */
export function buildRetrievalQuery(app: ExtractedApplication): string {
  const occupation = app.business.occupationClass ?? app.business.occupation
  const activities = app.business.activitiesSplit
    .map((entry) => `${entry.activity} ${entry.pct}%`)
    .join(', ')
  const claims = app.history.claimsLast5Years
  const openCount = claims.filter((claim) => claim.open).length
  const largest = claims.reduce(
    (max, claim) => Math.max(max, claim.amount ?? 0),
    0
  )
  const claimsProfile =
    claims.length === 0
      ? 'no claims in the last five years'
      : `${claims.length} claims in the last five years, largest $${largest}, ${openCount} open`

  return [
    `occupation class: ${occupation}`,
    `activities: ${activities}`,
    `claims profile: ${claimsProfile}`,
    `limit band: ${limitBand(app.cover.limitRequested)}`,
  ].join('; ')
}

let corpusVectors: Promise<number[][]> | undefined

/** Test hook: clears the once-per-process corpus embedding cache. */
export function resetCorpusEmbeddingsForTests(): void {
  corpusVectors = undefined
}

/** Embeds the whole corpus lazily, once per process. Failures are not cached. */
async function getCorpusVectors(): Promise<number[][]> {
  corpusVectors ??= embedTexts(
    loadGuidelineCorpus().map((chunk) => chunk.text),
    'retrieval-corpus'
  )

  try {
    return await corpusVectors
  } catch (error) {
    corpusVectors = undefined
    throw error
  }
}

/**
 * Stage 4 real path: embed the deterministic query, score every corpus chunk
 * with in-memory cosine similarity, and return the top-6 with their scores.
 */
export async function retrieveGuidelines(
  app: ExtractedApplication
): Promise<GuidelineContext> {
  const chunks = loadGuidelineCorpus()
  const vectors = await getCorpusVectors()
  const queryVector = (
    await embedTexts([buildRetrievalQuery(app)], 'retrieval-query')
  )[0]

  if (!queryVector) {
    throw new EmbeddingCallError(
      'retrieval-query',
      'no embedding returned for the query'
    )
  }

  const ranked = chunks
    .map((chunk, index) => ({
      chunk,
      score: cosineSimilarity(queryVector, vectors[index] ?? []),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K)

  return GuidelineContext.parse({
    chunks: ranked.map((entry) => entry.chunk),
    retrievalScores: Object.fromEntries(
      ranked.map((entry) => [entry.chunk.id, entry.score])
    ),
  })
}
