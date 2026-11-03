import { setTimeout as delay } from 'node:timers/promises'
import type { Block, OcrPage } from '../shared/contracts'
import { languageName } from '../shared/languages'
import { SAMPLE_NOTE_BLOCKS, SAMPLE_NOTE_TITLE, SAMPLE_TRANSLATIONS } from '../shared/sample'
import type { OcrHandlers, OcrInput, OcrResult, TranslationInput, TranslationResult } from './gemini'

function mockPage(pageId: string): OcrPage {
  const blocks: Block[] = SAMPLE_NOTE_BLOCKS.map((block, index) => ({
    ...block,
    id: `${pageId}-b${index}`,
  }))
  return {
    pageId,
    title: SAMPLE_NOTE_TITLE,
    detectedLanguage: { code: 'en', name: 'English', confidence: 0.96 },
    blocks,
    warnings: [],
  }
}

export async function mockOcr(
  input: OcrInput,
  handlers: OcrHandlers,
  signal: AbortSignal,
  stepDelayMs: number,
): Promise<OcrResult> {
  const startedAt = Date.now()
  const page = mockPage(input.pageId)

  for (let index = 0; index < page.blocks.length; index += 1) {
    await delay(stepDelayMs, undefined, { signal })
    const block = page.blocks[index]
    if (block) handlers.onBlock(block, index)
  }

  return {
    page,
    meta: { model: 'demo-reader', ms: Date.now() - startedAt, truncated: false },
  }
}

export async function mockTranslation(
  input: TranslationInput,
  handlers: { onBlock: (block: { id: string; text: string }, index: number) => void },
  signal: AbortSignal,
  stepDelayMs: number,
): Promise<TranslationResult> {
  const startedAt = Date.now()
  const sample = SAMPLE_TRANSLATIONS[input.target]
  const targetLabel = languageName(input.target)

  const blocks = input.blocks.map((block, index) => {
    const translated =
      input.target === 'en'
        ? block.text
        : sample?.[index] ??
          `[${targetLabel} demo translation]\n\n${block.text}`
    return { id: block.id, text: translated }
  })

  for (let index = 0; index < blocks.length; index += 1) {
    await delay(stepDelayMs, undefined, { signal })
    const block = blocks[index]
    if (block) handlers.onBlock(block, index)
  }

  return {
    blocks,
    meta: { model: 'demo-translator', ms: Date.now() - startedAt, cached: false },
  }
}
