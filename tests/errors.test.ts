// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { mapUpstreamError } from '../server/errors'

function upstream(status: number, message: string): Error {
  return Object.assign(new Error(message), { status })
}

describe('mapUpstreamError', () => {
  it('maps a zero-balance OpenRouter 402 to an actionable quota error', () => {
    const mapped = mapUpstreamError(upstream(402, 'Insufficient credits'), true, 'openrouter')
    expect(mapped.code).toBe('UPSTREAM_QUOTA')
    expect(mapped.status).toBe(402)
    expect(mapped.retryable).toBe(false)
    expect(mapped.message).toContain('OPENROUTER_MODEL')
  })

  it('maps a free-model daily cap to a non-retryable quota error', () => {
    const mapped = mapUpstreamError(
      upstream(429, 'Rate limit exceeded: free-models-per-day'),
      true,
      'openrouter',
    )
    expect(mapped.code).toBe('UPSTREAM_QUOTA')
    expect(mapped.retryable).toBe(false)
    expect(mapped.message).toContain('free OpenRouter model')
  })

  it('keeps a generic Gemini quota error retryable', () => {
    const mapped = mapUpstreamError(upstream(429, 'Resource has been exhausted'), true, 'gemini')
    expect(mapped.code).toBe('UPSTREAM_QUOTA')
    expect(mapped.retryable).toBe(true)
  })

  it('names the provider key when the upstream rejects it', () => {
    const mapped = mapUpstreamError(upstream(401, 'No auth credentials found'), true, 'openrouter')
    expect(mapped.code).toBe('MISSING_KEY')
    expect(mapped.message).toContain('OPENROUTER_API_KEY')
  })
})
