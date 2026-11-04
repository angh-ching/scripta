import type { Block, BlockType, OcrPage } from '../shared/contracts'
import { BLOCK_TYPES, clampBBox, clampConfidence } from '../shared/contracts'
import { languageName, normalizeLanguageCode } from '../shared/languages'

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function asString(value: unknown): string {
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

export function normalizeDetectedLanguage(raw: unknown, hintLanguage: string | undefined) {
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

export function normalizeWarnings(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((warning): warning is string => typeof warning === 'string')
    .map((warning) => warning.trim())
    .filter(Boolean)
    .slice(0, 8)
}

export function buildPageFromPayload(
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

export function dedupeWarnings(warnings: string[]): string[] {
  return [...new Set(warnings.map((warning) => warning.trim()).filter(Boolean))].slice(0, 10)
}

export function stripModelPrefix(model: string): string {
  return model.replace(/^models\//, '')
}

/**
 * Providers occasionally wrap structured output in a Markdown fence despite the
 * schema. Pull the outer object out before parsing so a fenced response still
 * yields a complete page.
 */
export function parseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const candidates = [trimmed]
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start !== -1 && end > start) candidates.push(trimmed.slice(start, end + 1))

  for (const candidate of candidates) {
    try {
      return asRecord(JSON.parse(candidate))
    } catch {
      // Try the next shape.
    }
  }
  return null
}
