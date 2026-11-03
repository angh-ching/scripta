import { createHash } from 'node:crypto'
import { GoogleGenAI } from '@google/genai'
import type { Block, BlockType, OcrPage, TranslatedBlock } from '../shared/contracts'
import { BLOCK_TYPES, clampBBox, clampConfidence } from '../shared/contracts'
import { languageName, normalizeLanguageCode } from '../shared/languages'
import type { ServerConfig } from './config'
import { AppError, mapUpstreamError } from './errors'
import {
  buildOcrPrompt,
  buildTranslationPrompt,
  OCR_RESPONSE_SCHEMA,
  TRANSLATION_RESPONSE_SCHEMA,
} from './prompts'
import { extractArrayObjects } from './stream-json'

export interface OcrInput {
  pageId: string
  image: Buffer
  mimeType: string
  hintLanguage: string | undefined
}

export interface OcrHandlers {
  onBlock: (block: Block, index: number) => void
  onWarning: (message: string) => void
}

export interface OcrResult {
  page: OcrPage
  meta: {
    model: string
    ms: number
    inputTokens?: number
    outputTokens?: number
    truncated: boolean
  }
}

export interface TranslationInput {
  source: string
  target: string
  blocks: { id: string; text: string }[]
}

export interface TranslationResult {
  blocks: TranslatedBlock[]
  meta: { model: string; ms: number; cached: boolean }
}

const MAX_ATTEMPTS = 3

function retryDelay(attempt: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, attempt * 1200))
}

interface TranslationCacheEntry {
  blocks: TranslatedBlock[]
  model: string
  at: number
}

const translationCache = new Map<string, TranslationCacheEntry>()
const TRANSLATION_CACHE_LIMIT = 50
let client: GoogleGenAI | null = null
let clientKey = ''

function getClient(config: ServerConfig): GoogleGenAI {
  if (!config.apiKey) {
    throw new AppError(
      'MISSING_KEY',
      'Add a Gemini API key to .env.local and restart the server.',
      503,
      false,
    )
  }
  if (!client || clientKey !== config.apiKey) {
    client = new GoogleGenAI({ apiKey: config.apiKey })
    clientKey = config.apiKey
  }
  return client
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function normalizeBlockType(value: unknown): BlockType {
  if (typeof value !== 'string') return 'other'
  const normalized = value.toLowerCase().trim()
  if ((BLOCK_TYPES as readonly string[]).includes(normalized)) return normalized as BlockType
  if (normalized === 'title' || normalized === 'subtitle') return 'heading'
  if (normalized === 'bullet' || normalized === 'bullets' || normalized === 'numbered_list') {
    return 'list'
  }
  if (normalized === 'math' || normalized === 'formula') return 'equation'
  if (normalized === 'tabular') return 'table'
  return 'other'
}

export function normalizeOcrBlock(raw: unknown, pageId: string, index: number): Block | null {
  const record = asRecord(raw)
  if (!record) return null
  const text = asString(record.text).trim()
  if (!text) return null

  return {
    id: `${pageId}-b${index}`,
    type: normalizeBlockType(record.type),
    text: text.slice(0, 40_000),
    bbox: clampBBox(record.bbox),
    confidence: clampConfidence(record.confidence),
  }
}

function normalizeDetectedLanguage(raw: unknown, hintLanguage: string | undefined) {
  const record = asRecord(raw)
  const rawCode = asString(record?.code) || hintLanguage || 'und'
  const code = normalizeLanguageCode(rawCode)
  const name = asString(record?.name).trim() || (code === 'und' ? 'Unknown' : languageName(code))
  return {
    code,
    name: name.slice(0, 80),
    confidence: clampConfidence(record?.confidence ?? 0.6),
  }
}

function normalizeWarnings(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((warning): warning is string => typeof warning === 'string')
    .map((warning) => warning.trim())
    .filter(Boolean)
    .slice(0, 8)
}

function buildPageFromPayload(
  payload: Record<string, unknown>,
  pageId: string,
  hintLanguage: string | undefined,
): OcrPage {
  const rawBlocks = Array.isArray(payload.blocks) ? payload.blocks : []
  const blocks = rawBlocks
    .map((block, index) => normalizeOcrBlock(block, pageId, index))
    .filter((block): block is Block => block !== null)

  return {
    pageId,
    title: asString(payload.title).trim().slice(0, 200),
    detectedLanguage: normalizeDetectedLanguage(payload.detectedLanguage, hintLanguage),
    blocks,
    warnings: normalizeWarnings(payload.warnings),
  }
}

function dedupeWarnings(warnings: string[]): string[] {
  return [...new Set(warnings.map((warning) => warning.trim()).filter(Boolean))].slice(0, 10)
}

function stripModelPrefix(model: string): string {
  return model.replace(/^models\//, '')
}

export async function streamOcr(
  config: ServerConfig,
  input: OcrInput,
  handlers: OcrHandlers,
  signal: AbortSignal,
): Promise<OcrResult> {
  const ai = getClient(config)
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
      const stream = await ai.models.generateContentStream({
        model: config.model,
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: input.mimeType, data: input.image.toString('base64') } },
              { text: buildOcrPrompt(input.hintLanguage) },
            ],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: OCR_RESPONSE_SCHEMA,
          temperature: 0.1,
          maxOutputTokens: 16_384,
          abortSignal: signal,
        },
      })

      for await (const chunk of stream) {
        const text = chunk.text
        if (text) rawText += text

        const objects = extractArrayObjects(rawText, 'blocks')
        for (let index = seenObjects; index < objects.length; index += 1) {
          const block = normalizeOcrBlock(objects[index], input.pageId, index)
          if (block) {
            emittedBlocks.push(block)
            handlers.onBlock(block, index)
          }
        }
        seenObjects = Math.max(seenObjects, objects.length)

        if (chunk.modelVersion) model = stripModelPrefix(chunk.modelVersion)
        if (chunk.promptFeedback?.blockReason) safetyBlocked = true

        const candidate = chunk.candidates?.[0]
        if (candidate?.finishReason) finishReason = String(candidate.finishReason)

        if (chunk.usageMetadata) {
          inputTokens = chunk.usageMetadata.promptTokenCount ?? inputTokens
          outputTokens = chunk.usageMetadata.candidatesTokenCount ?? outputTokens
        }
      }
      break
    } catch (error) {
      const mapped = mapUpstreamError(error, Boolean(config.apiKey))
      const canRetry =
        mapped.retryable &&
        !signal.aborted &&
        attempt < MAX_ATTEMPTS &&
        emittedBlocks.length === 0 &&
        !rawText
      if (!canRetry) throw mapped
      await retryDelay(attempt)
    }
  }

  if (safetyBlocked) {
    throw new AppError(
      'SAFETY_BLOCKED',
      'Gemini could not process this page. Try a different scan.',
      422,
      false,
    )
  }

  let parsedPayload: Record<string, unknown> | null = null
  if (rawText.trim()) {
    try {
      parsedPayload = asRecord(JSON.parse(rawText))
    } catch {
      parsedPayload = null
    }
  }

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
    warnings.push('Part of the page was withheld by Gemini’s safety filter.')
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

function cacheKey(input: TranslationInput): string {
  const hash = createHash('sha256')
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
  const key = cacheKey(input)
  const cached = translationCache.get(key)
  if (cached) {
    cached.blocks.forEach((block, index) => handlers.onBlock(block, index))
    return {
      blocks: cached.blocks,
      meta: { model: cached.model, ms: Date.now() - startedAt, cached: true },
    }
  }

  const ai = getClient(config)
  const requestedIds = new Set(input.blocks.map((block) => block.id))
  const translated = new Map<string, string>()
  let rawText = ''
  let seenObjects = 0
  let model = config.model

  for (let attempt = 1; ; attempt += 1) {
    try {
      const stream = await ai.models.generateContentStream({
        model: config.model,
        contents: buildTranslationPrompt(input),
        config: {
          responseMimeType: 'application/json',
          responseSchema: TRANSLATION_RESPONSE_SCHEMA,
          temperature: 0.2,
          maxOutputTokens: 16_384,
          abortSignal: signal,
        },
      })

      for await (const chunk of stream) {
        const text = chunk.text
        if (text) rawText += text

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

        if (chunk.modelVersion) model = stripModelPrefix(chunk.modelVersion)
      }
      break
    } catch (error) {
      const mapped = mapUpstreamError(error, Boolean(config.apiKey))
      const canRetry =
        mapped.retryable &&
        !signal.aborted &&
        attempt < MAX_ATTEMPTS &&
        translated.size === 0 &&
        !rawText
      if (!canRetry) throw mapped
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
