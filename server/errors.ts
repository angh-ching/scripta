import type { ApiError, ErrorCode } from '../shared/contracts'
import { apiError } from '../shared/contracts'
import { providerKeyName, providerLabel, type AiProvider } from './config'

export class AppError extends Error {
  readonly status: number
  readonly code: ErrorCode
  readonly retryable: boolean
  readonly expose: boolean

  constructor(
    code: ErrorCode,
    message: string,
    status = 500,
    retryable = false,
    expose = true,
    cause?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = status
    this.retryable = retryable
    this.expose = expose
    if (cause !== undefined) {
      this.cause = cause
    }
  }

  toApiError(): ApiError {
    return apiError(this.code, this.message, this.retryable)
  }
}

export function missingKeyError(provider: AiProvider): AppError {
  return new AppError(
    'MISSING_KEY',
    `Add an ${providerLabel(provider)} API key (${providerKeyName(provider)}) to .env.local and restart the server.`,
    503,
    false,
  )
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && (error.name === 'AbortError' || error.message.includes('aborted')))
  )
}

interface UpstreamErrorLike {
  status?: number
  code?: number | string
  message?: string
  name?: string
}

export function mapUpstreamError(
  error: unknown,
  apiKeyConfigured: boolean,
  provider: AiProvider = 'gemini',
): AppError {
  if (error instanceof AppError) return error
  const label = providerLabel(provider)
  if (isAbortError(error)) {
    return new AppError(
      'TIMEOUT',
      'The reading took too long. Try again with a smaller image.',
      504,
      true,
    )
  }

  const candidate = error as UpstreamErrorLike
  const status = typeof candidate?.status === 'number' ? candidate.status : undefined
  const rawMessage = typeof candidate?.message === 'string' ? candidate.message : ''
  const message = rawMessage.toLowerCase()

  if (!apiKeyConfigured) return missingKeyError(provider)

  if (
    provider === 'openrouter' &&
    (status === 429 || status === 402) &&
    (message.includes('free-model') ||
      message.includes('free model') ||
      message.includes('per-day') ||
      message.includes('per day'))
  ) {
    return new AppError(
      'UPSTREAM_QUOTA',
      'The free OpenRouter model hit its request limit. Add credits or switch OPENROUTER_MODEL.',
      429,
      false,
    )
  }

  if (provider === 'openrouter' && status === 402) {
    return new AppError(
      'UPSTREAM_QUOTA',
      'OpenRouter has no credits for this model. Add credits, or set OPENROUTER_MODEL to a :free model.',
      402,
      false,
    )
  }

  if (status === 429 || message.includes('resource_exhausted') || message.includes('quota')) {
    return new AppError(
      'UPSTREAM_QUOTA',
      `${label}’s quota is used up right now. Wait a moment, then retry.`,
      429,
      true,
    )
  }

  if (
    status === 401 ||
    status === 403 ||
    ((status === 400 || status === 403) &&
      (message.includes('api key') ||
        message.includes('permission') ||
        message.includes('unauthenticated')))
  ) {
    return new AppError(
      'MISSING_KEY',
      `${label} rejected the API key. Check ${providerKeyName(provider)} in .env.local.`,
      503,
      false,
    )
  }

  if (
    status === 400 &&
    (message.includes('model') ||
      message.includes('response_format') ||
      message.includes('structured'))
  ) {
    return new AppError(
      'BAD_MODEL_OUTPUT',
      `${label} could not use the configured model. Check the model name and that it supports vision and structured output.`,
      503,
      false,
    )
  }

  if (
    message.includes('safety') ||
    message.includes('blocked') ||
    message.includes('responsible ai')
  ) {
    return new AppError(
      'SAFETY_BLOCKED',
      `${label} could not process this image. Try a different scan.`,
      422,
      false,
    )
  }

  if (message.includes('timeout') || message.includes('deadline')) {
    return new AppError('TIMEOUT', `${label} took too long to respond. Try again.`, 504, true)
  }

  if (status !== undefined && status >= 500) {
    return new AppError(
      'INTERNAL',
      `${label} had a temporary problem. Try again in a moment.`,
      502,
      true,
      true,
      error,
    )
  }

  return new AppError(
    'BAD_MODEL_OUTPUT',
    'The model could not read this page. Try a clearer photo.',
    422,
    true,
  )
}
