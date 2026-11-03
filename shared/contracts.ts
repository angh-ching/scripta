import { z } from 'zod'

export const BLOCK_TYPES = [
  'heading',
  'paragraph',
  'list',
  'equation',
  'table',
  'code',
  'other',
] as const

export type BlockType = (typeof BLOCK_TYPES)[number]

export const blockTypeSchema = z.enum(BLOCK_TYPES)

/** Normalized coordinates: [ymin, xmin, ymax, xmax], each 0–1000. */
export const bboxSchema = z.tuple([
  z.number().min(0).max(1000),
  z.number().min(0).max(1000),
  z.number().min(0).max(1000),
  z.number().min(0).max(1000),
])

export const blockSchema = z.object({
  id: z.string().min(1),
  type: blockTypeSchema,
  text: z.string(),
  bbox: bboxSchema.nullable(),
  confidence: z.number().min(0).max(1),
})

export type Block = z.infer<typeof blockSchema>

export const detectedLanguageSchema = z.object({
  code: z.string().min(2).max(20),
  name: z.string().min(1).max(80),
  confidence: z.number().min(0).max(1),
})

export type DetectedLanguage = z.infer<typeof detectedLanguageSchema>

export const ocrPageSchema = z.object({
  pageId: z.string().min(1).max(80),
  title: z.string().max(200),
  detectedLanguage: detectedLanguageSchema,
  blocks: z.array(blockSchema),
  warnings: z.array(z.string()),
})

export type OcrPage = z.infer<typeof ocrPageSchema>

export const ocrMetaSchema = z.object({
  model: z.string(),
  ms: z.number().nonnegative(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  truncated: z.boolean(),
})

export type OcrMeta = z.infer<typeof ocrMetaSchema>

export const ERROR_CODES = [
  'MISSING_KEY',
  'INVALID_IMAGE',
  'TOO_LARGE',
  'RATE_LIMITED',
  'UPSTREAM_QUOTA',
  'SAFETY_BLOCKED',
  'TIMEOUT',
  'BAD_MODEL_OUTPUT',
  'NOT_FOUND',
  'INTERNAL',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

export const apiErrorSchema = z.object({
  code: z.enum(ERROR_CODES),
  message: z.string(),
  retryable: z.boolean(),
})

export type ApiError = z.infer<typeof apiErrorSchema>

export const ocrStreamEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('start'),
    pageId: z.string(),
    model: z.string(),
  }),
  z.object({
    type: z.literal('block'),
    block: blockSchema,
    index: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('warning'),
    message: z.string(),
  }),
  z.object({
    type: z.literal('done'),
    page: ocrPageSchema,
    meta: ocrMetaSchema,
  }),
  z.object({
    type: z.literal('error'),
    error: apiErrorSchema,
  }),
])

export type OcrStreamEvent = z.infer<typeof ocrStreamEventSchema>

export const ocrResponseSchema = z.object({
  page: ocrPageSchema,
  meta: ocrMetaSchema,
})

export type OcrResponse = z.infer<typeof ocrResponseSchema>

export const translateRequestSchema = z.object({
  source: z.string().min(2).max(30),
  target: z.string().min(2).max(30),
  blocks: z
    .array(
      z.object({
        id: z.string().min(1).max(120),
        text: z.string().max(20_000),
      }),
    )
    .min(1)
    .max(200),
})

export type TranslateRequest = z.infer<typeof translateRequestSchema>

export const translatedBlockSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
})

export type TranslatedBlock = z.infer<typeof translatedBlockSchema>

export const translateStreamEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('start'),
    target: z.string(),
    model: z.string(),
  }),
  z.object({
    type: z.literal('block'),
    block: translatedBlockSchema,
    index: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('done'),
    blocks: z.array(translatedBlockSchema),
    meta: z.object({
      model: z.string(),
      ms: z.number().nonnegative(),
      cached: z.boolean(),
    }),
  }),
  z.object({
    type: z.literal('error'),
    error: apiErrorSchema,
  }),
])

export type TranslateStreamEvent = z.infer<typeof translateStreamEventSchema>

export const healthSchema = z.object({
  ok: z.boolean(),
  mode: z.enum(['live', 'mock', 'unconfigured']),
  model: z.string(),
  maxUploadMb: z.number(),
  version: z.string(),
})

export type Health = z.infer<typeof healthSchema>

export function isBBox(value: unknown): value is [number, number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((part) => typeof part === 'number' && Number.isFinite(part))
  )
}

export function clampBBox(value: unknown): [number, number, number, number] | null {
  if (!isBBox(value)) return null
  const [a, b, c, d] = value
  const ymin = Math.max(0, Math.min(1000, Math.min(a, c)))
  const ymax = Math.max(0, Math.min(1000, Math.max(a, c)))
  const xmin = Math.max(0, Math.min(1000, Math.min(b, d)))
  const xmax = Math.max(0, Math.min(1000, Math.max(b, d)))
  if (ymax - ymin < 2 || xmax - xmin < 2) return null
  return [ymin, xmin, ymax, xmax]
}

export function clampConfidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0.5
  const normalized = value > 1 ? value / 100 : value
  return Math.max(0, Math.min(1, normalized))
}

export function apiError(
  code: ErrorCode,
  message: string,
  retryable = code === 'RATE_LIMITED' || code === 'UPSTREAM_QUOTA' || code === 'TIMEOUT',
): ApiError {
  return { code, message, retryable }
}
