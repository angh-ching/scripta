import type { ModelChunk, OcrInput, TranslationInput } from './ai-types'
import type { ServerConfig } from './config'
import { missingKeyError } from './errors'
import { asRecord, asString, stripModelPrefix } from './model-output'
import {
  buildOcrPrompt,
  buildTranslationPrompt,
  OCR_JSON_SCHEMA,
  TRANSLATION_JSON_SCHEMA,
} from './prompts'

/**
 * Errors keep a numeric status so mapUpstreamError can distinguish a bad key,
 * an empty account, a rate limit, and a transient provider failure.
 */
class OpenRouterRequestError extends Error {
  readonly status: number | undefined

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'OpenRouterRequestError'
    if (status !== undefined) this.status = status
  }
}

interface StreamState {
  model: string
  finishReason: string
  inputTokens: number | undefined
  outputTokens: number | undefined
  done: boolean
}

function numeric(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function upstreamErrorFromPayload(payload: Record<string, unknown>): OpenRouterRequestError {
  const raw = asRecord(payload.error) ?? payload
  const message = asString(raw.message) || 'OpenRouter stopped the stream unexpectedly.'
  const code = raw.code

  let status: number | undefined
  if (typeof code === 'number') status = code
  else if (code === 'rate_limit' || code === 'rate_limited' || code === 'too_many_requests') {
    status = 429
  } else if (
    code === 'server_error' ||
    code === 'provider_unavailable' ||
    code === 'provider_disconnected' ||
    code === 'timeout'
  ) {
    status = 502
  } else if (code === 'invalid_api_key' || code === 'authentication') {
    status = 401
  }

  return new OpenRouterRequestError(message, status)
}

async function readHttpError(response: Response): Promise<OpenRouterRequestError> {
  const text = await response.text().catch(() => '')
  let message = text.trim().slice(0, 600)
  let code: unknown

  try {
    const parsed = asRecord(JSON.parse(text))
    const error = asRecord(parsed?.error) ?? parsed
    message = asString(error?.message) || message
    code = error?.code
  } catch {
    // Keep the raw body snippet.
  }

  const status = typeof code === 'number' ? code : response.status
  return new OpenRouterRequestError(
    message || `OpenRouter returned HTTP ${response.status}.`,
    status,
  )
}

function mapFinishReason(raw: string, fallback: string): string {
  const reason = raw.toLowerCase()
  if (reason === 'length') return 'MAX_TOKENS'
  if (reason === 'content_filter') return 'SAFETY'
  if (reason === 'error') return 'ERROR'
  if (reason === 'stop' || reason === 'end_turn') return 'STOP'
  return raw || fallback
}

function handleDataLine(line: string, state: StreamState): ModelChunk | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith(':')) return null
  if (!trimmed.startsWith('data:')) return null

  const data = trimmed.slice(5).trim()
  if (data === '[DONE]') {
    state.done = true
    return null
  }

  let parsed: Record<string, unknown> | null = null
  try {
    parsed = asRecord(JSON.parse(data))
  } catch {
    return null
  }
  if (!parsed) return null
  if (parsed.error) throw upstreamErrorFromPayload(parsed)

  const model = asString(parsed.model)
  if (model) state.model = stripModelPrefix(model)

  const usage = asRecord(parsed.usage)
  if (usage) {
    state.inputTokens = numeric(usage.prompt_tokens) ?? state.inputTokens
    state.outputTokens = numeric(usage.completion_tokens) ?? state.outputTokens
  }

  const choices = Array.isArray(parsed.choices) ? parsed.choices : []
  const choice = asRecord(choices[0])
  if (!choice) return null

  const finish = asString(choice.finish_reason) || asString(choice.native_finish_reason)
  if (finish) {
    state.finishReason = mapFinishReason(finish, state.finishReason)
    if (state.finishReason === 'ERROR') throw upstreamErrorFromPayload(parsed)
  }

  const delta = asRecord(choice.delta)
  const text = asString(delta?.content)
  if (!text) return null

  return {
    text,
    model: state.model,
    ...(state.finishReason ? { finishReason: state.finishReason } : {}),
  }
}

async function* streamChatCompletion(
  config: ServerConfig,
  body: Record<string, unknown>,
  signal: AbortSignal,
): AsyncGenerator<ModelChunk> {
  if (!config.openrouterApiKey) throw missingKeyError('openrouter')

  const response = await fetch(`${config.openrouterBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openrouterApiKey}`,
      'Content-Type': 'application/json',
      'X-Title': 'Scripta',
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) throw await readHttpError(response)

  if (!response.body) {
    throw new OpenRouterRequestError('OpenRouter returned an empty response stream.', 502)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const state: StreamState = {
    model: config.openrouterModel,
    finishReason: '',
    inputTokens: undefined,
    outputTokens: undefined,
    done: false,
  }

  let buffer = ''

  const drain = function* (final = false): Generator<ModelChunk> {
    let newline = buffer.indexOf('\n')
    while (newline !== -1) {
      const line = buffer.slice(0, newline).replace(/\r$/, '')
      buffer = buffer.slice(newline + 1)
      const chunk = handleDataLine(line, state)
      if (chunk) yield chunk
      if (state.done) return
      newline = buffer.indexOf('\n')
    }

    if (final && buffer.trim()) {
      const chunk = handleDataLine(buffer, state)
      buffer = ''
      if (chunk) yield chunk
    }
  }

  try {
    while (!state.done) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      yield* drain()
    }

    if (!state.done) {
      buffer += decoder.decode()
      yield* drain(true)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }

  yield {
    model: state.model,
    ...(state.finishReason ? { finishReason: state.finishReason } : {}),
    ...(state.inputTokens !== undefined ? { inputTokens: state.inputTokens } : {}),
    ...(state.outputTokens !== undefined ? { outputTokens: state.outputTokens } : {}),
  }
}

export async function* streamOpenRouterOcr(
  config: ServerConfig,
  input: OcrInput,
  signal: AbortSignal,
): AsyncGenerator<ModelChunk> {
  const dataUrl = `data:${input.mimeType};base64,${input.image.toString('base64')}`

  yield* streamChatCompletion(
    config,
    {
      model: config.openrouterModel,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: buildOcrPrompt(input.hintLanguage) },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 16_384,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'scripta_ocr',
          strict: true,
          schema: OCR_JSON_SCHEMA,
        },
      },
      provider: { require_parameters: true },
      stream: true,
    },
    signal,
  )
}

export async function* streamOpenRouterTranslation(
  config: ServerConfig,
  input: TranslationInput,
  signal: AbortSignal,
): AsyncGenerator<ModelChunk> {
  yield* streamChatCompletion(
    config,
    {
      model: config.openrouterModel,
      messages: [{ role: 'user', content: buildTranslationPrompt(input) }],
      temperature: 0.2,
      max_tokens: 16_384,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'scripta_translation',
          strict: true,
          schema: TRANSLATION_JSON_SCHEMA,
        },
      },
      provider: { require_parameters: true },
      stream: true,
    },
    signal,
  )
}
