import type { Block } from '../../../shared/contracts'
import { countDocumentWords, isLowConfidence } from '../../../shared/blocks'
import type { NoteState, SourcePage } from './types'

export interface BlockLocation {
  pageId: string
  pageName: string
  block: Block
}

export function activePage(note: NoteState): SourcePage | undefined {
  return note.pages.find((page) => page.id === note.activePageId) ?? note.pages[0]
}

export function allBlockLocations(note: NoteState): BlockLocation[] {
  return note.pages.flatMap((page) =>
    page.blocks.map((block) => ({ pageId: page.id, pageName: page.name, block })),
  )
}

export function allBlocks(note: NoteState): Block[] {
  return note.pages.flatMap((page) => page.blocks)
}

export function lowConfidenceLocations(note: NoteState): BlockLocation[] {
  return allBlockLocations(note).filter(({ block }) => isLowConfidence(block))
}

export function unreviewedLocations(note: NoteState): BlockLocation[] {
  return lowConfidenceLocations(note).filter(({ block }) => !note.reviewed[block.id])
}

export function documentWordCount(note: NoteState): number {
  return countDocumentWords(allBlocks(note))
}

export function documentLanguage(note: NoteState): {
  code: string
  name: string
  confidence: number
  mixed: boolean
} | null {
  const detected = note.pages
    .map((page) => page.detectedLanguage)
    .filter((language): language is NonNullable<typeof language> => Boolean(language))
  if (detected.length === 0) return null
  const codes = new Set(detected.map((language) => language.code))
  const first = detected[0]
  if (!first) return null
  return {
    code: first.code,
    name: first.name,
    confidence: first.confidence,
    mixed: codes.size > 1,
  }
}

export function isNoteEmpty(note: NoteState): boolean {
  return note.pages.length === 0
}

export function hasAnyBlocks(note: NoteState): boolean {
  return note.pages.some((page) => page.blocks.length > 0)
}

export function isProcessing(note: NoteState): boolean {
  return note.pages.some((page) => page.status === 'processing' || page.status === 'queued')
}

export function lastModel(note: NoteState): string | null {
  for (let index = note.pages.length - 1; index >= 0; index -= 1) {
    const page = note.pages[index]
    if (page?.meta?.model) return page.meta.model
  }
  return null
}
