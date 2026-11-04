import { GoogleGenAI } from '@google/genai'
import type { ServerConfig } from './config'
import type { ModelChunk, OcrInput, TranslationInput } from './ai-types'
import { missingKeyError } from './errors'
import { stripModelPrefix } from './model-output'
import {
  buildOcrPrompt,
  buildTranslationPrompt,
  OCR_RESPONSE_SCHEMA,
  TRANSLATION_RESPONSE_SCHEMA,
} from './prompts'

let client: GoogleGenAI | null = null
let clientKey = ''

function getClient(config: ServerConfig): GoogleGenAI {
  if (!config.geminiApiKey) throw missingKeyError('gemini')
  if (!client || clientKey !== config.geminiApiKey) {
    client = new GoogleGenAI({ apiKey: config.geminiApiKey })
    clientKey = config.geminiApiKey
  }
  return client
}

function chunkMetadata(chunk: {
  modelVersion?: string
  promptFeedback?: { blockReason?: unknown }
  candidates?: { finishReason?: unknown }[]
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
}): ModelChunk {
  return {
    ...(chunk.modelVersion ? { model: stripModelPrefix(chunk.modelVersion) } : {}),
    ...(chunk.promptFeedback?.blockReason ? { safetyBlocked: true } : {}),
    ...(chunk.candidates?.[0]?.finishReason
      ? { finishReason: String(chunk.candidates[0].finishReason) }
      : {}),
    ...(chunk.usageMetadata?.promptTokenCount !== undefined
      ? { inputTokens: chunk.usageMetadata.promptTokenCount }
      : {}),
    ...(chunk.usageMetadata?.candidatesTokenCount !== undefined
      ? { outputTokens: chunk.usageMetadata.candidatesTokenCount }
      : {}),
  }
}

export async function* streamGeminiOcr(
  config: ServerConfig,
  input: OcrInput,
  signal: AbortSignal,
): AsyncGenerator<ModelChunk> {
  const ai = getClient(config)
  const stream = await ai.models.generateContentStream({
    model: config.geminiModel,
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
    yield {
      ...chunkMetadata(chunk),
      ...(chunk.text ? { text: chunk.text } : {}),
    }
  }
}

export async function* streamGeminiTranslation(
  config: ServerConfig,
  input: TranslationInput,
  signal: AbortSignal,
): AsyncGenerator<ModelChunk> {
  const ai = getClient(config)
  const stream = await ai.models.generateContentStream({
    model: config.geminiModel,
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
    yield {
      ...chunkMetadata(chunk),
      ...(chunk.text ? { text: chunk.text } : {}),
    }
  }
}
