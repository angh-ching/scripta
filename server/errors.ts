import type { ApiError, ErrorCode } from '../shared/contracts'
import { apiError } from '../shared/contracts'

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

export function mapUpstreamError(error: unknown, apiKeyConfigured: boolean): AppError {
  if (error instanceof AppError) return error
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

  if (!apiKeyConfigured) {
    return new AppError(
      'MISSING_KEY',
      'Add a Gemini API key to .env.local and restart the server.',
      503,
      false,
    )
  }

  if (status === 429 || message.includes('resource_exhausted') || message.includes('quota')) {
    return new AppError(
      'UPSTREAM_QUOTA',
      'Gemini’s quota is used up right now. Wait a moment, then retry.',
      429,
      true,
    )
  }

  if (
    (status === 400 || status === 403) &&
    (message.includes('api key') ||
      message.includes('permission') ||
      message.includes('unauthenticated'))
  ) {
    return new AppError(
      'MISSING_KEY',
      'Gemini rejected the API key. Check GEMINI_API_KEY in .env.local.',
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
      'Gemini could not process this image. Try a different scan.',
      422,
      false,
    )
  }

  if (message.includes('timeout') || message.includes('deadline')) {
    return new AppError('TIMEOUT', 'Gemini took too long to respond. Try again.', 504, true)
  }

  if (status !== undefined && status >= 500) {
    return new AppError(
      'INTERNAL',
      'Gemini had a temporary problem. Try again in a moment.',
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
