import { z } from 'zod'

export const GuidelineChunk = z.object({
  /** Stable chunk id — Stage 5 citations must reference these; validated by code. */
  id: z.string(),
  guidelineVersion: z.string(),
  headingPath: z.array(z.string()),
  text: z.string(),
})
export type GuidelineChunk = z.infer<typeof GuidelineChunk>

/** Stage 4 output. Day 1: in-memory cosine top-k over a mini corpus; pgvector + rerank is Day 2+. */
export const GuidelineContext = z.object({
  chunks: z.array(GuidelineChunk),
  /** Retrieval score per chunk id. */
  retrievalScores: z.record(z.string(), z.number()),
})
export type GuidelineContext = z.infer<typeof GuidelineContext>
