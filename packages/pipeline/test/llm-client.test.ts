import Anthropic from '@anthropic-ai/sdk'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { z } from 'zod'

import {
  callStructured,
  getAnthropicClient,
  LlmCallError,
  MODELS,
  setAnthropicClientForTests,
} from '../src/llm/client'

const Out = z.object({ answer: z.string() })
const opts = { model: MODELS.fast, system: 'sys', user: 'doc', label: 'test' }

interface CapturedRequest {
  model: string
  max_tokens: number
  temperature: number
  system: { text: string; cache_control: unknown }[]
  output_config: { format: unknown }
}

function inject(parse: ReturnType<typeof vi.fn>): ReturnType<typeof vi.fn> {
  setAnthropicClientForTests({ messages: { parse } } as unknown as Anthropic)

  return parse
}

function capturedRequest(parse: ReturnType<typeof vi.fn>): CapturedRequest {
  return parse.mock.calls[0]?.[0] as CapturedRequest
}

/** instanceof-compatible SDK error without needing the real constructor args. */
function fakeSdkError<T extends Error>(
  prototype: T,
  status?: number
): T & { status?: number } {
  const error = Object.create(prototype) as T & { status?: number }

  error.status = status

  return error
}

afterEach(() => {
  setAnthropicClientForTests(undefined)
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('model routing', () => {
  test('pins Haiku for fast calls and Sonnet for reasoning', () => {
    expect(MODELS.fast).toContain('haiku')
    expect(MODELS.reasoning).toContain('sonnet')
  })

  test('model ids can be overridden per environment', async () => {
    vi.stubEnv('ANTHROPIC_MODEL_FAST', 'custom-fast')
    vi.stubEnv('ANTHROPIC_MODEL_REASONING', 'custom-reasoning')
    vi.resetModules()
    const fresh = await import('../src/llm/client')

    expect(fresh.MODELS.fast).toBe('custom-fast')
    expect(fresh.MODELS.reasoning).toBe('custom-reasoning')
  })
})

describe('getAnthropicClient', () => {
  test('lazily constructs a singleton', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
    const first = getAnthropicClient()

    expect(first).toBeInstanceOf(Anthropic)
    expect(getAnthropicClient()).toBe(first)
  })
})

describe('callStructured', () => {
  test('returns schema-validated output and wires caching + structured format', async () => {
    const parse = inject(
      vi.fn().mockResolvedValue({ parsed_output: { answer: 'hi' } })
    )

    await expect(callStructured(Out, opts)).resolves.toEqual({ answer: 'hi' })
    expect(parse).toHaveBeenCalledTimes(1)
    const request = capturedRequest(parse)

    expect(request.model).toBe(MODELS.fast)
    expect(request.system[0]?.cache_control).toEqual({ type: 'ephemeral' })
    expect(request.output_config.format).toBeDefined()
    expect(request.max_tokens).toBe(4000)
    expect(request.temperature).toBe(0)
  })

  test('honours explicit maxTokens and temperature', async () => {
    const parse = inject(
      vi.fn().mockResolvedValue({ parsed_output: { answer: 'hi' } })
    )

    await callStructured(Out, { ...opts, maxTokens: 1234, temperature: 0.4 })
    const request = capturedRequest(parse)

    expect(request.max_tokens).toBe(1234)
    expect(request.temperature).toBe(0.4)
  })

  test('retries when output fails schema parsing, then succeeds', async () => {
    const parse = inject(
      vi
        .fn()
        .mockResolvedValueOnce({ parsed_output: null })
        .mockResolvedValueOnce({ parsed_output: { answer: 'ok' } })
    )

    await expect(callStructured(Out, opts)).resolves.toEqual({ answer: 'ok' })
    expect(parse).toHaveBeenCalledTimes(2)
  })

  test('gives up after exhausting parse retries', async () => {
    const parse = inject(vi.fn().mockResolvedValue({ parsed_output: null }))

    await expect(callStructured(Out, opts)).rejects.toThrow(
      'failed after 3 attempts'
    )
    expect(parse).toHaveBeenCalledTimes(3)
  })

  test('throws immediately on non-retryable errors', async () => {
    const parse = inject(vi.fn().mockRejectedValue(new Error('bad request')))

    await expect(callStructured(Out, opts)).rejects.toBeInstanceOf(LlmCallError)
    expect(parse).toHaveBeenCalledTimes(1)
  })

  test('retries rate limits with backoff, then succeeds', async () => {
    vi.useFakeTimers()
    const rateLimited = fakeSdkError(Anthropic.RateLimitError.prototype)
    const parse = inject(
      vi
        .fn()
        .mockRejectedValueOnce(rateLimited)
        .mockResolvedValueOnce({ parsed_output: { answer: 'ok' } })
    )
    const pending = callStructured(Out, opts)

    await vi.advanceTimersByTimeAsync(1000)

    await expect(pending).resolves.toEqual({ answer: 'ok' })
    expect(parse).toHaveBeenCalledTimes(2)
  })

  test('exhausts retries on persistent 5xx and wraps the last error', async () => {
    vi.useFakeTimers()
    const serverError = fakeSdkError(Anthropic.APIError.prototype, 503)
    const parse = inject(vi.fn().mockRejectedValue(serverError))
    const pending = callStructured(Out, opts)

    // Attach a handler before advancing timers to avoid unhandled-rejection noise.
    // eslint-disable-next-line promise/prefer-await-to-then
    void pending.catch(() => undefined)
    await vi.advanceTimersByTimeAsync(6000)

    await expect(pending).rejects.toThrow('failed after 3 attempts')
    expect(parse).toHaveBeenCalledTimes(3)
  })

  test('treats an APIError without a numeric 5xx status as non-retryable', async () => {
    const clientError = fakeSdkError(Anthropic.APIError.prototype, 400)
    const parse = inject(vi.fn().mockRejectedValue(clientError))

    await expect(callStructured(Out, opts)).rejects.toBeInstanceOf(LlmCallError)
    expect(parse).toHaveBeenCalledTimes(1)
  })
})
