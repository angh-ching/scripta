import { describe, expect, it } from 'vitest'
import type { Block } from '../shared/contracts'
import { createNoteState, workspaceReducer } from '../src/features/workspace/reducer'
import type { NoteState, SourcePage, TranslationState } from '../src/features/workspace/types'

function makeBlock(id: string, text: string, confidence = 0.9): Block {
  return { id, type: 'paragraph', text, bbox: [0, 0, 100, 100], confidence }
}

function makePage(id: string, blocks: Block[] = []): SourcePage {
  return {
    id,
    name: `${id}.jpg`,
    status: 'done',
    blob: new Blob(['x']),
    previewUrl: `blob:${id}`,
    width: 800,
    height: 1000,
    blocks,
    detectedLanguage: { code: 'en', name: 'English', confidence: 0.9 },
    warnings: [],
    meta: { model: 'test', ms: 10, truncated: false },
    error: null,
  }
}

function doneTranslation(): TranslationState {
  return {
    targetLang: 'es',
    status: 'done',
    blocks: { b1: 'Hola' },
    meta: { model: 'translator', ms: 5, cached: false },
    error: null,
    stale: false,
  }
}

function baseState(): NoteState {
  return {
    ...createNoteState(),
    title: 'Field notes',
    titleTouched: true,
    pages: [makePage('p1', [makeBlock('b1', 'Hello')])],
    activePageId: 'p1',
    translation: doneTranslation(),
  }
}

describe('workspaceReducer', () => {
  it('adds pages and keeps the first page active', () => {
    const state = workspaceReducer(createNoteState(), {
      type: 'ADD_PAGES',
      pages: [makePage('p1'), makePage('p2')],
    })
    expect(state.pages).toHaveLength(2)
    expect(state.activePageId).toBe('p1')
  })

  it('streams blocks without duplicating an id', () => {
    let state = workspaceReducer(createNoteState(), {
      type: 'ADD_PAGES',
      pages: [{ ...makePage('p1'), status: 'processing' }],
    })
    state = workspaceReducer(state, { type: 'PAGE_START', pageId: 'p1' })
    state = workspaceReducer(state, {
      type: 'PAGE_BLOCK',
      pageId: 'p1',
      block: makeBlock('p1-b0', 'first'),
    })
    state = workspaceReducer(state, {
      type: 'PAGE_BLOCK',
      pageId: 'p1',
      block: makeBlock('p1-b0', 'first, revised'),
    })
    expect(state.pages[0]?.blocks).toHaveLength(1)
    expect(state.pages[0]?.blocks[0]?.text).toBe('first, revised')
  })

  it('uses the model title only when the author has not touched it', () => {
    const page = { ...makePage('p1'), status: 'processing' as const }
    let state = workspaceReducer(createNoteState(), { type: 'ADD_PAGES', pages: [page] })
    state = workspaceReducer(state, {
      type: 'PAGE_DONE',
      pageId: 'p1',
      blocks: [makeBlock('p1-b0', 'Tide report')],
      detectedLanguage: { code: 'en', name: 'English', confidence: 0.95 },
      warnings: [],
      title: 'North Jetty',
      meta: { model: 'gemini', ms: 120, truncated: false },
    })
    expect(state.title).toBe('North Jetty')
    expect(state.pages[0]?.status).toBe('done')
  })

  it('marks a finished translation stale after a text edit', () => {
    const state = workspaceReducer(baseState(), {
      type: 'EDIT_BLOCK',
      pageId: 'p1',
      blockId: 'b1',
      text: 'Hello there',
      at: 1_000,
    })
    expect(state.translation?.stale).toBe(true)
    expect(state.undo).toHaveLength(1)
    expect(state.pages[0]?.blocks[0]?.text).toBe('Hello there')
  })

  it('coalesces quick edits into one undo step', () => {
    let state = workspaceReducer(baseState(), {
      type: 'EDIT_BLOCK',
      pageId: 'p1',
      blockId: 'b1',
      text: 'Hello t',
      at: 1_000,
    })
    state = workspaceReducer(state, {
      type: 'EDIT_BLOCK',
      pageId: 'p1',
      blockId: 'b1',
      text: 'Hello th',
      at: 1_300,
    })
    expect(state.undo).toHaveLength(1)
  })

  it('undoes and redoes edits', () => {
    const state = workspaceReducer(baseState(), {
      type: 'EDIT_BLOCK',
      pageId: 'p1',
      blockId: 'b1',
      text: 'Changed',
      at: 2_000,
    })
    const undone = workspaceReducer(state, { type: 'UNDO' })
    expect(undone.pages[0]?.blocks[0]?.text).toBe('Hello')
    const redone = workspaceReducer(undone, { type: 'REDO' })
    expect(redone.pages[0]?.blocks[0]?.text).toBe('Changed')
  })

  it('drops the selection when its block leaves with a removed page', () => {
    const state: NoteState = {
      ...baseState(),
      pages: [makePage('p1', [makeBlock('b1', 'One')]), makePage('p2', [makeBlock('b2', 'Two')])],
      selectedBlockId: 'b2',
    }
    const next = workspaceReducer(state, { type: 'REMOVE_PAGE', pageId: 'p2' })
    expect(next.pages).toHaveLength(1)
    expect(next.selectedBlockId).toBeNull()
    expect(next.activePageId).toBe('p1')
  })

  it('clears a translation when the target language changes', () => {
    const next = workspaceReducer(baseState(), { type: 'SET_TARGET_LANG', targetLang: 'fr' })
    expect(next.targetLang).toBe('fr')
    expect(next.translation).toBeNull()
  })

  it('records review marks without losing others', () => {
    let state = workspaceReducer(baseState(), { type: 'MARK_REVIEWED', blockId: 'b1' })
    state = workspaceReducer(state, { type: 'MARK_REVIEWED', blockId: 'b2' })
    expect(state.reviewed).toEqual({ b1: true, b2: true })
    state = workspaceReducer(state, { type: 'UNMARK_REVIEWED', blockId: 'b1' })
    expect(state.reviewed).toEqual({ b2: true })
  })
})
