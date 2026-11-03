import type { z } from 'zod'
import type { ApiError, Health, OcrStreamEvent, TranslateStreamEvent } from '../../shared/contracts'
import {
  apiError,
  apiErrorSchema,
  healthSchema,
  ocrStreamEventSchema,
  translateStreamEventSchema,
} from '../../shared/contracts'

export class ApiRequestError extends Error {
  readonly apiError: ApiError

  constructor(apiErrorValue: ApiError) {
    super(apiErrorValue.message)
    this.name = 'ApiRequestError'
    this.apiError = apiErrorValue
  }
}

function networkError(): ApiRequestError {
  return new ApiRequestError(
    apiError('INTERNAL', 'Could not reach the reading service. Check that the server is running.', true),
  )
}

async function errorFromResponse(response: Response): Promise<ApiRequestError> {
  try {
    const payload: unknown = await response.json()
    if (typeof payload === 'object' && payload !== null && 'error' in payload) {
      const parsed = apiErrorSchema.safeParse((payload as { error: unknown }).error)
      if (parsed.success) return new ApiRequestError(parsed.data)
    }
  } catch {
    // fall through to a friendly generic error
  }

  if (response.status === 413) {
    return new ApiRequestError(apiError('TOO_LARGE', 'That image is too large.', false))
  }
  if (response.status === 429) {
    return new ApiRequestError(
      apiError('RATE_LIMITED', 'Too many scans in a minute. Try again shortly.', true),
    )
  }
  return new ApiRequestError(
    apiError(
      response.status >= 500 ? 'INTERNAL' : 'INVALID_IMAGE',
      'The reading service could not complete that request.',
      response.status >= 500,
    ),
  )
}

export async function* readNdjson<T>(
  response: Response,
  schema: z.ZodType<T>,
): AsyncGenerator<T> {
  if (!response.body) throw networkError()
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let newline = buffer.indexOf('\n')
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (line) yield parseLine(line, schema)
        newline = buffer.indexOf('\n')
      }
    }
    buffer += decoder.decode()
    const tail = buffer.trim()
    if (tail) yield parseLine(tail, schema)
  } finally {
    reader.releaseLock()
  }
}

function parseLine<T>(line: string, schema: z.ZodType<T>): T {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    throw new ApiRequestError(
      apiError('BAD_MODEL_OUTPUT', 'The reading stream was malformed. Try the scan again.', true),
    )
  }
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw new ApiRequestError(
      apiError('BAD_MODEL_OUTPUT', 'The reading stream was incomplete. Try the scan again.', true),
    )
  }
  return parsed.data
}

export async function fetchHealth(signal?: AbortSignal): Promise<Health> {
  let response: Response
  try {
    response = await fetch('/api/health', {
      signal: signal ?? null,
      headers: { Accept: 'application/json' },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw networkError()
  }
  if (!response.ok) throw await errorFromResponse(response)
  const parsed = healthSchema.safeParse(await response.json())
  if (!parsed.success) throw networkError()
  return parsed.data
}

export async function streamOcrRequest(options: {
  image: Blob
  pageId: string
  hintLanguage?: string
  signal: AbortSignal
  onEvent: (event: OcrStreamEvent) => void
}): Promise<void> {
  const form = new FormData()
  form.append('image', options.image, 'page.jpg')
  form.append('pageId', options.pageId)
  if (options.hintLanguage) form.append('hintLanguage', options.hintLanguage)

  let response: Response
  try {
    response = await fetch('/api/ocr', {
      method: 'POST',
      body: form,
      headers: { Accept: 'application/x-ndjson' },
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw networkError()
  }

  if (!response.ok) throw await errorFromResponse(response)

  for await (const event of readNdjson(response, ocrStreamEventSchema)) {
    options.onEvent(event)
  }
}

export async function streamTranslationRequest(options: {
  source: string
  target: string
  blocks: { id: string; text: string }[]
  signal: AbortSignal
  onEvent: (event: TranslateStreamEvent) => void
}): Promise<void> {
  let response: Response
  try {
    response = await fetch('/api/translate', {
      method: 'POST',
      body: JSON.stringify({
        source: options.source,
        target: options.target,
        blocks: options.blocks,
      }),
      headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw networkError()
  }

  if (!response.ok) throw await errorFromResponse(response)

  for await (const event of readNdjson(response, translateStreamEventSchema)) {
    options.onEvent(event)
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
