// cspell:ignore voyageai chunker
import { ExtractedApplication, GuidelineChunk } from '@prism/contracts'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { z } from 'zod'

import extractedFixture from '../../../fixtures/extracted-application.json'
import guidelineFixture from '../../../fixtures/guideline-context.json'
import {
  chunkGuidelineMarkdown,
  GUIDELINE_VERSION,
  loadGuidelineCorpus,
} from '../src/corpus'
import {
  buildRetrievalQuery,
  cosineSimilarity,
  resetCorpusEmbeddingsForTests,
  retrieveGuidelines,
  TOP_K,
} from '../src/corpus/retrieve'
import { type PipelineState, type StageContext } from '../src/index'
import {
  EmbeddingCallError,
  embedTexts,
  VOYAGE_EMBEDDINGS_URL,
  VOYAGE_MODEL,
} from '../src/llm/voyage'
import { retrievalStage } from '../src/stages/retrieval'

const app = ExtractedApplication.parse(extractedFixture)

function mockCtx(overrides: Partial<StageContext> = {}): StageContext {
  return {
    applicationId: '3f7c9d1e-8a2b-4c5d-9e6f-1a2b3c4d5e6f',
    requestId: 'req-test',
    mockMode: true,
    emit: () => undefined,
    ...overrides,
  }
}

function embeddingsResponse(vectors: number[][], status = 200): Response {
  return new Response(
    JSON.stringify({
      data: vectors.map((embedding, index) => ({ index, embedding })),
    }),
    { status }
  )
}

/**
 * Stubs global fetch with a Voyage-shaped responder: the handler receives the
 * request's input texts and returns the vectors to embed them as.
 */
function stubEmbeddings(
  handler: (input: string[]) => number[][]
): ReturnType<typeof vi.fn> {
  const mock = vi.fn((_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(init?.body as string) as { input: string[] }

    return Promise.resolve(embeddingsResponse(handler(body.input)))
  })

  vi.stubGlobal('fetch', mock)

  return mock
}

function requestedInput(
  mock: ReturnType<typeof vi.fn>,
  call: number
): string[] {
  const init = mock.mock.calls[call]?.[1] as { body: string }

  return (JSON.parse(init.body) as { input: string[] }).input
}

beforeEach(() => {
  vi.stubEnv('VOYAGE_API_KEY', 'test-key')
})

afterEach(() => {
  resetCorpusEmbeddingsForTests()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('guideline markdown chunker', () => {
  const synthetic = [
    'document preamble is ignored',
    '# Top',
    'category preamble is ignored too',
    '## First',
    'line one',
    '',
    'line two  ',
    '# Next',
    '## Second',
    'body',
  ].join('\n')

  test('emits one chunk per ## section with heading paths and stable ids', () => {
    const chunks = chunkGuidelineMarkdown(synthetic)

    expect(chunks.map((c) => c.id)).toEqual(['gl-v1-001', 'gl-v1-002'])
    expect(chunks.map((c) => c.headingPath)).toEqual([
      ['Top', 'First'],
      ['Next', 'Second'],
    ])
    expect(chunks[0]?.text).toBe('Top > First\n\nline one\n\nline two')
    expect(chunks[1]?.guidelineVersion).toBe(GUIDELINE_VERSION)
  })

  test('a ## section before any # heading gets a single-element heading path', () => {
    const chunks = chunkGuidelineMarkdown('## Orphan\nbody')

    expect(chunks).toHaveLength(1)
    expect(chunks[0]?.headingPath).toEqual(['Orphan'])
    expect(chunks[0]?.text).toBe('Orphan\n\nbody')
  })
})

describe('guideline corpus loader', () => {
  const corpus = loadGuidelineCorpus()

  test('loads contract-valid chunks with sequential ids in document order', () => {
    expect(corpus.length).toBeGreaterThanOrEqual(10)
    expect(() => z.array(GuidelineChunk).parse(corpus)).not.toThrow()
    expect(corpus.map((c) => c.id)).toEqual(
      corpus.map((_, i) => `gl-v1-${String(i + 1).padStart(3, '0')}`)
    )
    expect(corpus.every((c) => c.guidelineVersion === GUIDELINE_VERSION)).toBe(
      true
    )
  })

  test('prepends the heading path to every chunk text', () => {
    for (const chunk of corpus) {
      expect(chunk.headingPath).toHaveLength(2)
      expect(
        chunk.text.startsWith(`${chunk.headingPath.join(' > ')}\n\n`)
      ).toBe(true)
      expect(chunk.text.length).toBeGreaterThan(200)
    }
  })

  test('covers the five topics of the mock fixture corpus', () => {
    const paths = corpus.map((c) => c.headingPath.join(' > '))

    expect(paths).toEqual(
      expect.arrayContaining([
        'Appetite > Management Consultants',
        'Rating > Claims History',
        'Exposure > Overseas Work and North American Revenue',
        'Cover > Retroactive Dates',
        'Conditions > Contract Hygiene and Engagement Letters',
      ])
    )
  })

  test('parses the markdown file only once per process', () => {
    expect(loadGuidelineCorpus()).toBe(corpus)
  })
})

describe('voyage embeddings client', () => {
  test('pins the default model and allows env override', async () => {
    expect(VOYAGE_MODEL).toBe('voyage-3.5-lite')
    vi.stubEnv('VOYAGE_MODEL', 'custom-embed')
    vi.resetModules()
    const fresh = await import('../src/llm/voyage')

    expect(fresh.VOYAGE_MODEL).toBe('custom-embed')
  })

  test('POSTs model + input with the bearer key and returns vectors in input order', async () => {
    const mock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { index: 1, embedding: [2] },
            { index: 0, embedding: [1] },
          ],
        }),
        { status: 200 }
      )
    )

    vi.stubGlobal('fetch', mock)

    await expect(embedTexts(['a', 'b'], 'test')).resolves.toEqual([[1], [2]])
    expect(mock).toHaveBeenCalledTimes(1)
    expect(mock.mock.calls[0]?.[0]).toBe(VOYAGE_EMBEDDINGS_URL)
    expect(VOYAGE_EMBEDDINGS_URL).toBe('https://api.voyageai.com/v1/embeddings')
    const init = mock.mock.calls[0]?.[1] as {
      method: string
      headers: Record<string, string>
      body: string
    }

    expect(init.method).toBe('POST')
    expect(init.headers.authorization).toBe('Bearer test-key')
    expect(JSON.parse(init.body)).toEqual({
      model: 'voyage-3.5-lite',
      input: ['a', 'b'],
    })
  })

  test('throws when VOYAGE_API_KEY is not set', async () => {
    vi.stubEnv('VOYAGE_API_KEY', undefined)

    await expect(embedTexts(['a'], 'test')).rejects.toThrow(
      'VOYAGE_API_KEY is not set'
    )
  })

  test('throws immediately on a non-retryable 4xx', async () => {
    const mock = vi
      .fn()
      .mockResolvedValue(new Response('bad request', { status: 400 }))

    vi.stubGlobal('fetch', mock)

    await expect(embedTexts(['a'], 'test')).rejects.toThrow(
      'embeddings call failed with status 400'
    )
    expect(mock).toHaveBeenCalledTimes(1)
  })

  test('throws when the response body fails schema validation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [{ index: 0, embedding: 'x' }] }), {
          status: 200,
        })
      )
    )

    const promise = embedTexts(['a'], 'test')

    await expect(promise).rejects.toBeInstanceOf(EmbeddingCallError)
    await expect(promise).rejects.toThrow('failed schema validation')
  })

  test('retries a 429 with backoff, then succeeds', async () => {
    vi.useFakeTimers()
    const mock = vi
      .fn()
      .mockResolvedValueOnce(new Response('slow down', { status: 429 }))
      .mockResolvedValueOnce(embeddingsResponse([[1]]))

    vi.stubGlobal('fetch', mock)
    const pending = embedTexts(['a'], 'test')

    await vi.advanceTimersByTimeAsync(1000)

    await expect(pending).resolves.toEqual([[1]])
    expect(mock).toHaveBeenCalledTimes(2)
  })

  test('exhausts retries on persistent 5xx and reports the last failure', async () => {
    vi.useFakeTimers()
    const mock = vi
      .fn()
      .mockResolvedValue(new Response('unavailable', { status: 503 }))

    vi.stubGlobal('fetch', mock)
    const pending = embedTexts(['a'], 'test')

    // Attach a handler before advancing timers to avoid unhandled-rejection noise.
    // eslint-disable-next-line promise/prefer-await-to-then
    void pending.catch(() => undefined)
    await vi.advanceTimersByTimeAsync(6000)

    await expect(pending).rejects.toThrow('failed after 3 attempts')
    expect(mock).toHaveBeenCalledTimes(3)
  })
})

describe('cosine similarity', () => {
  test('scores identical directions 1 and orthogonal directions 0', () => {
    expect(cosineSimilarity([3, 4], [3, 4])).toBeCloseTo(1, 10)
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0)
  })

  test('a zero vector scores 0 instead of dividing by zero', () => {
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0)
  })

  test('treats dimensions missing from the second vector as zero', () => {
    expect(cosineSimilarity([1, 1], [1])).toBeCloseTo(Math.SQRT1_2, 10)
  })
})

describe('deterministic query construction', () => {
  test('is built from occupation class, activities, claims profile, and limit band', () => {
    expect(buildRetrievalQuery(app)).toBe(
      'occupation class: management_consultant; ' +
        'activities: strategy consulting 70%, operational reviews 30%; ' +
        'claims profile: no claims in the last five years; ' +
        'limit band: up to $1,000,000'
    )
  })

  test('falls back to the free-text occupation when the class is unresolved', () => {
    const unclassified = {
      ...app,
      business: { ...app.business, occupationClass: null },
    }

    expect(buildRetrievalQuery(unclassified)).toContain(
      'occupation class: management consulting for mid-market retailers'
    )
  })

  test('reports claim count, largest known amount, and open claims', () => {
    const claimant = {
      ...app,
      history: {
        ...app.history,
        claimsLast5Years: [
          { year: 2024, description: 'fee dispute', amount: null, open: true },
          {
            year: 2022,
            description: 'bad advice',
            amount: 50_000,
            open: false,
          },
        ],
      },
    }

    expect(buildRetrievalQuery(claimant)).toContain(
      'claims profile: 2 claims in the last five years, largest $50000, 1 open'
    )
  })

  test('bands the requested limit', () => {
    const withLimit = (limitRequested: number): ExtractedApplication => ({
      ...app,
      cover: { ...app.cover, limitRequested },
    })

    expect(buildRetrievalQuery(withLimit(2_000_000))).toContain(
      'limit band: $1,000,001 to $2,000,000'
    )
    expect(buildRetrievalQuery(withLimit(5_000_000))).toContain(
      'limit band: above $2,000,000'
    )
  })
})

describe('retrieveGuidelines', () => {
  const corpus = loadGuidelineCorpus()

  test('ranks chunks by cosine similarity and returns the top 6 with scores', async () => {
    // Chunk i is embedded as [1, i]; a query of [1, 0] ranks them in document order.
    stubEmbeddings((input) =>
      input.length === 1 ? [[1, 0]] : input.map((_, i) => [1, i])
    )
    const context = await retrieveGuidelines(app)

    expect(context.chunks).toHaveLength(TOP_K)
    expect(context.chunks.map((c) => c.id)).toEqual(
      corpus.slice(0, TOP_K).map((c) => c.id)
    )
    const scores = context.chunks.map((c) => context.retrievalScores[c.id])

    expect(scores[0]).toBeCloseTo(1, 10)
    expect([...scores].sort((a, b) => (b ?? 0) - (a ?? 0))).toEqual(scores)
  })

  test('a query aligned with a different chunk puts that chunk first', async () => {
    const last = corpus.at(-1)

    stubEmbeddings((input) =>
      input.length === 1
        ? [[1, corpus.length - 1]]
        : input.map((_, i) => [1, i])
    )
    const context = await retrieveGuidelines(app)

    expect(context.chunks[0]?.id).toBe(last?.id)
    expect(context.retrievalScores[last?.id ?? '']).toBeCloseTo(1, 10)
  })

  test('embeds the corpus only once per process across retrievals', async () => {
    const mock = stubEmbeddings((input) =>
      input.map((_, i) => (input.length === 1 ? [1, 0] : [1, i]))
    )

    await retrieveGuidelines(app)
    await retrieveGuidelines(app)

    // 1 corpus embed + 2 query embeds — never a second corpus embed.
    expect(mock).toHaveBeenCalledTimes(3)
    expect(requestedInput(mock, 0)).toHaveLength(corpus.length)
    expect(requestedInput(mock, 0)[0]).toBe(corpus[0]?.text)
    expect(requestedInput(mock, 1)).toEqual([buildRetrievalQuery(app)])
    expect(requestedInput(mock, 2)).toHaveLength(1)
  })

  test('does not cache a failed corpus embedding', async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(new Response('bad request', { status: 400 }))

    vi.stubGlobal('fetch', mock)

    await expect(retrieveGuidelines(app)).rejects.toThrow('status 400')

    mock.mockImplementation((_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string) as { input: string[] }

      return Promise.resolve(
        embeddingsResponse(body.input.map((_, i) => [1, i]))
      )
    })

    await expect(retrieveGuidelines(app)).resolves.toBeDefined()
    // Failed corpus embed + successful corpus embed + query embed.
    expect(mock).toHaveBeenCalledTimes(3)
  })

  test('throws when the API returns no embedding for the query', async () => {
    stubEmbeddings((input) =>
      input.length === 1 ? [] : input.map((_, i) => [1, i])
    )

    await expect(retrieveGuidelines(app)).rejects.toThrow(
      'no embedding returned for the query'
    )
  })

  test('scores chunks with missing corpus vectors as zero', async () => {
    stubEmbeddings((input) => (input.length === 1 ? [[1, 0]] : [[1, 0]]))
    const context = await retrieveGuidelines(app)

    expect(context.chunks[0]?.id).toBe(corpus[0]?.id)
    expect(context.retrievalScores[corpus[0]?.id ?? '']).toBeCloseTo(1, 10)
    expect(context.retrievalScores[corpus[1]?.id ?? '']).toBe(0)
  })
})

describe('retrieval stage', () => {
  test('mock mode returns the fixture context unchanged', async () => {
    const state: PipelineState = { submission: { source: 'form', form: {} } }
    const result = await retrievalStage.run(state, mockCtx())

    expect(result.guidelines).toEqual(guidelineFixture)
  })

  test('real mode retrieves top-6 guidelines for the extracted application', async () => {
    stubEmbeddings((input) =>
      input.length === 1 ? [[1, 0]] : input.map((_, i) => [1, i])
    )
    const state: PipelineState = {
      submission: { source: 'form', form: {} },
      extraction: app,
    }
    const result = await retrievalStage.run(state, mockCtx({ mockMode: false }))

    expect(result.extraction).toBe(app)
    expect(result.guidelines?.chunks).toHaveLength(TOP_K)
    expect(result.guidelines?.chunks[0]?.guidelineVersion).toBe(
      GUIDELINE_VERSION
    )
  })
})
