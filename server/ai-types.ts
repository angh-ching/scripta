import type { Block, OcrPage, TranslatedBlock } from '../shared/contracts'

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

/**
 * One increment from a provider. Text is appended to the partial JSON buffer;
 * metadata is folded into the final page/result. A metadata-only final chunk
 * (empty text) carries finish reason and usage.
 */
export interface ModelChunk {
  text?: string
  model?: string
  finishReason?: string
  safetyBlocked?: boolean
  inputTokens?: number
  outputTokens?: number
}
