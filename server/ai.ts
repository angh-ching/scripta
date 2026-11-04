import { createHash } from 'node:crypto'
import type { Block, TranslatedBlock } from '../shared/contracts'
import type {
  ModelChunk,
  OcrHandlers,
  OcrInput,
  OcrResult,
  TranslationInput,
  TranslationResult,
} from './ai-types'
import type { ServerConfig } from './config'
import { AppError, mapUpstreamError } from './errors'
import { streamGeminiOcr, streamGeminiTranslation } from './gemini'
import {
  asRecord,
  asString,
  buildPageFromPayload,
  dedupeWarnings,
  normalizeDetectedLanguage,
  normalizeOcrBlock,
  parseJsonObject,
  stripModelPrefix,
} from './model-output'
import { streamOpenRouterOcr, streamOpenRouterTranslation } from './openrouter'
import { extractArrayObjects } from './stream-json'

export type {
  OcrHandlers,
  OcrInput,
  OcrResult,
  TranslationInput,
  TranslationResult,
} from './ai-types'

const MAX_ATTEMPTS = 3

function retryDelay(attempt: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, attempt * 1200))
}

function chunksForOcr(
  config: ServerConfig,
  input: OcrInput,
  signal: AbortSignal,
): AsyncGenerator<ModelChunk> {
  return config.provider === 'openrouter'
    ? streamOpenRouterOcr(config, input, signal)
    : streamGeminiOcr(config, input, signal)
}

function chunksForTranslation(
  config: ServerConfig,
  input: TranslationInput,
  signal: AbortSignal,
): AsyncGenerator<ModelChunk> {
  return config.provider === 'openrouter'
    ? streamOpenRouterTranslation(config, input, signal)
    : streamGeminiTranslation(config, input, signal)
}

interface TranslationCacheEntry {
  blocks: TranslatedBlock[]
  model: string
  at: number
}

const translationCache = new Map<string, TranslationCacheEntry>()
const TRANSLATION_CACHE_LIMIT = 50

export async function streamOcr(
  config: ServerConfig,
  input: OcrInput,
  handlers: OcrHandlers,
  signal: AbortSignal,
): Promise<OcrResult> {
  const startedAt = Date.now()
  const emittedBlocks: Block[] = []
  const warnings: string[] = []
  let rawText = ''
  let seenObjects = 0
  let finishReason = ''
  let model = config.model
  let inputTokens: number | undefined
  let outputTokens: number | undefined
  let safetyBlocked = false

  for (let attempt = 1; ; attempt += 1) {
    try {
      for await (const chunk of chunksForOcr(config, input, signal)) {
        if (chunk.text) rawText += chunk.text

        const objects = extractArrayObjects(rawText, 'blocks')
        for (let index = seenObjects; index < objects.length; index += 1) {
          const block = normalizeOcrBlock(objects[index], input.pageId, index)
          if (block) {
            emittedBlocks.push(block)
            handlers.onBlock(block, index)
          }
        }
        seenObjects = Math.max(seenObjects, objects.length)

        if (chunk.model) model = stripModelPrefix(chunk.model)
        if (chunk.safetyBlocked) safetyBlocked = true
        if (chunk.finishReason) finishReason = chunk.finishReason
        if (chunk.inputTokens !== undefined) inputTokens = chunk.inputTokens
        if (chunk.outputTokens !== undefined) outputTokens = chunk.outputTokens
      }
      break
    } catch (error) {
      const mapped = mapUpstreamError(error, Boolean(config.apiKey), config.provider)
      const canRetry =
        mapped.retryable &&
        !signal.aborted &&
        attempt < MAX_ATTEMPTS &&
        emittedBlocks.length === 0 &&
        !rawText
      if (!canRetry) throw mapped

      model = config.model
      finishReason = ''
      inputTokens = undefined
      outputTokens = undefined
      safetyBlocked = false
      await retryDelay(attempt)
    }
  }

  if (safetyBlocked) {
    throw new AppError(
      'SAFETY_BLOCKED',
      'The model could not process this page. Try a different scan.',
      422,
      false,
    )
  }

  const parsedPayload = parseJsonObject(rawText)
  let page = parsedPayload
    ? buildPageFromPayload(parsedPayload, input.pageId, input.hintLanguage)
    : null

  const truncated = finishReason.includes('MAX_TOKENS') || !parsedPayload
  if ((!page || page.blocks.length === 0) && emittedBlocks.length > 0) {
    page = {
      pageId: input.pageId,
      title: '',
      detectedLanguage: normalizeDetectedLanguage(null, input.hintLanguage),
      blocks: emittedBlocks,
      warnings: [],
    }
  }

  if (!page || (page.blocks.length === 0 && !parsedPayload)) {
    throw new AppError(
      'BAD_MODEL_OUTPUT',
      'The model could not structure this page. Try a clearer photo or another scan.',
      422,
      true,
    )
  }

  if (truncated) {
    warnings.push(
      'The page was cut off before the end. Try scanning the page in two halves for full detail.',
    )
  }
  if (page.blocks.length === 0) {
    warnings.push('No readable writing was found on this page.')
  }
  if (finishReason.includes('SAFETY')) {
    warnings.push('Part of the page was withheld by the model’s safety filter.')
  }

  page.warnings = dedupeWarnings([...page.warnings, ...warnings])
  for (const warning of page.warnings) handlers.onWarning(warning)

  return {
    page,
    meta: {
      model,
      ms: Date.now() - startedAt,
      ...(inputTokens !== undefined ? { inputTokens } : {}),
      ...(outputTokens !== undefined ? { outputTokens } : {}),
      truncated,
    },
  }
}

function cacheKey(config: ServerConfig, input: TranslationInput): string {
  const hash = createHash('sha256')
  hash.update(config.provider)
  hash.update('\u0000')
  hash.update(config.model)
  hash.update('\u0000')
  hash.update(input.source)
  hash.update('\u0000')
  hash.update(input.target)
  for (const block of input.blocks) {
    hash.update('\u0000')
    hash.update(block.id)
    hash.update('\u0001')
    hash.update(block.text)
  }
  return hash.digest('hex')
}

function rememberTranslation(key: string, entry: TranslationCacheEntry): void {
  translationCache.set(key, entry)
  while (translationCache.size > TRANSLATION_CACHE_LIMIT) {
    const oldest = translationCache.keys().next().value
    if (oldest === undefined) break
    translationCache.delete(oldest)
  }
}

export function clearTranslationCache(): void {
  translationCache.clear()
}

export async function streamTranslation(
  config: ServerConfig,
  input: TranslationInput,
  handlers: { onBlock: (block: TranslatedBlock, index: number) => void },
  signal: AbortSignal,
): Promise<TranslationResult> {
  const startedAt = Date.now()
  const key = cacheKey(config, input)
  const cached = translationCache.get(key)
  if (cached) {
    cached.blocks.forEach((block, index) => handlers.onBlock(block, index))
    return {
      blocks: cached.blocks,
      meta: { model: cached.model, ms: Date.now() - startedAt, cached: true },
    }
  }

  const requestedIds = new Set(input.blocks.map((block) => block.id))
  const translated = new Map<string, string>()
  let rawText = ''
  let seenObjects = 0
  let model = config.model

  for (let attempt = 1; ; attempt += 1) {
    try {
      for await (const chunk of chunksForTranslation(config, input, signal)) {
        if (chunk.text) rawText += chunk.text

        const objects = extractArrayObjects(rawText, 'blocks')
        for (let index = seenObjects; index < objects.length; index += 1) {
          const record = asRecord(objects[index])
          const id = asString(record?.id)
          const translatedText = asString(record?.text).trim()
          if (!id || !requestedIds.has(id) || !translatedText || translated.has(id)) continue
          translated.set(id, translatedText)
          const requestIndex = input.blocks.findIndex((block) => block.id === id)
          handlers.onBlock({ id, text: translatedText }, requestIndex)
        }
        seenObjects = Math.max(seenObjects, objects.length)

        if (chunk.model) model = stripModelPrefix(chunk.model)
      }
      break
    } catch (error) {
      const mapped = mapUpstreamError(error, Boolean(config.apiKey), config.provider)
      const canRetry =
        mapped.retryable &&
        !signal.aborted &&
        attempt < MAX_ATTEMPTS &&
        translated.size === 0 &&
        !rawText
      if (!canRetry) throw mapped

      model = config.model
      await retryDelay(attempt)
    }
  }

  if (translated.size === 0) {
    throw new AppError('BAD_MODEL_OUTPUT', 'The translation came back empty. Try again.', 422, true)
  }

  const finalBlocks: TranslatedBlock[] = input.blocks.map((block) => ({
    id: block.id,
    text: translated.get(block.id) ?? block.text,
  }))

  rememberTranslation(key, { blocks: finalBlocks, model, at: Date.now() })

  return {
    blocks: finalBlocks,
    meta: { model, ms: Date.now() - startedAt, cached: false },
  }
}
