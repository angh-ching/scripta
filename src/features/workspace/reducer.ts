import type { Block, BlockType, DetectedLanguage, OcrMeta, ApiError } from '../../../shared/contracts'
import { titleFromBlocks } from '../../../shared/blocks'
import { newId } from '../../lib/id'
import type { NoteState, SourcePage, TranslationState } from './types'

export type WorkspaceAction =
  | { type: 'ADD_PAGES'; pages: SourcePage[] }
  | { type: 'REMOVE_PAGE'; pageId: string }
  | { type: 'SET_ACTIVE_PAGE'; pageId: string }
  | { type: 'PAGE_START'; pageId: string }
  | { type: 'PAGE_BLOCK'; pageId: string; block: Block }
  | { type: 'PAGE_WARNING'; pageId: string; message: string }
  | {
      type: 'PAGE_DONE'
      pageId: string
      blocks: Block[]
      detectedLanguage: DetectedLanguage
      warnings: string[]
      title: string
      meta: OcrMeta
    }
  | { type: 'PAGE_ERROR'; pageId: string; error: ApiError }
  | { type: 'RESET_PAGE'; pageId: string }
  | { type: 'EDIT_BLOCK'; pageId: string; blockId: string; text: string; at: number }
  | { type: 'CHANGE_BLOCK_TYPE'; pageId: string; blockId: string; blockType: BlockType }
  | { type: 'DELETE_BLOCK'; pageId: string; blockId: string }
  | { type: 'SET_SELECTED_BLOCK'; blockId: string | null; pageId?: string }
  | { type: 'SET_HOVERED_BLOCK'; blockId: string | null }
  | { type: 'SET_TARGET_LANG'; targetLang: string }
  | { type: 'SET_TITLE'; title: string }
  | { type: 'SET_VIEW_MODE'; viewMode: 'edit' | 'preview' }
  | { type: 'SET_REVIEW_MODE'; reviewMode: boolean }
  | { type: 'MARK_REVIEWED'; blockId: string }
  | { type: 'UNMARK_REVIEWED'; blockId: string }
  | { type: 'TRANSLATION_START'; targetLang: string }
  | { type: 'TRANSLATION_BLOCK'; blockId: string; text: string }
  | {
      type: 'TRANSLATION_DONE'
      blocks: { id: string; text: string }[]
      meta: { model: string; ms: number; cached: boolean }
    }
  | { type: 'TRANSLATION_ERROR'; error: ApiError }
  | { type: 'EDIT_TRANSLATION'; blockId: string; text: string }
  | { type: 'LOAD_NOTE'; note: NoteState }
  | { type: 'RESET'; note: NoteState }
  | { type: 'UNDO' }
  | { type: 'REDO' }

function defaultTargetLanguage(): string {
  const locale = typeof navigator !== 'undefined' ? navigator.language : 'en'
  const base = locale.split('-')[0]?.toLowerCase() ?? 'en'
  return base && base !== 'en' ? base : 'es'
}

export function createNoteState(): NoteState {
  return {
    id: `note-${newId()}`,
    title: '',
    titleTouched: false,
    createdAt: Date.now(),
    pages: [],
    activePageId: null,
    selectedBlockId: null,
    hoveredBlockId: null,
    targetLang: defaultTargetLanguage(),
    translation: null,
    reviewed: {},
    reviewMode: false,
    viewMode: 'edit',
    undo: [],
    redo: [],
    lastEdit: null,
  }
}

function markTranslationStale(translation: TranslationState | null): TranslationState | null {
  if (!translation || translation.stale) return translation
  return { ...translation, stale: true }
}

function pushUndo(state: NoteState, pages: SourcePage[]): NoteState {
  return {
    ...state,
    pages,
    undo: [...state.undo, state.pages].slice(-40),
    redo: [],
    translation: markTranslationStale(state.translation),
    lastEdit: null,
  }
}

function updatePage(
  state: NoteState,
  pageId: string,
  updater: (page: SourcePage) => SourcePage,
): SourcePage[] {
  return state.pages.map((page) => (page.id === pageId ? updater(page) : page))
}

function updateBlock(
  page: SourcePage,
  blockId: string,
  updater: (block: Block) => Block,
): SourcePage {
  return {
    ...page,
    blocks: page.blocks.map((block) => (block.id === blockId ? updater(block) : block)),
  }
}

export function workspaceReducer(state: NoteState, action: WorkspaceAction): NoteState {
  switch (action.type) {
    case 'ADD_PAGES': {
      if (action.pages.length === 0) return state
      return {
        ...state,
        pages: [...state.pages, ...action.pages],
        activePageId: state.activePageId ?? action.pages[0]?.id ?? null,
      }
    }

    case 'REMOVE_PAGE': {
      const index = state.pages.findIndex((page) => page.id === action.pageId)
      if (index === -1) return state
      const pages = state.pages.filter((page) => page.id !== action.pageId)
      const activePageId =
        state.activePageId === action.pageId
          ? (pages[Math.min(index, pages.length - 1)]?.id ?? null)
          : state.activePageId
      const selectedStillExists = pages.some((page) =>
        page.blocks.some((block) => block.id === state.selectedBlockId),
      )
      return {
        ...state,
        pages,
        activePageId,
        selectedBlockId: selectedStillExists ? state.selectedBlockId : null,
      }
    }

    case 'SET_ACTIVE_PAGE':
      return { ...state, activePageId: action.pageId }

    case 'PAGE_START':
      return {
        ...state,
        pages: updatePage(state, action.pageId, (page) => ({
          ...page,
          status: 'processing',
          blocks: [],
          warnings: [],
          detectedLanguage: null,
          meta: null,
          error: null,
        })),
        activePageId: state.activePageId ?? action.pageId,
      }

    case 'PAGE_BLOCK':
      return {
        ...state,
        pages: updatePage(state, action.pageId, (page) => {
          if (page.status !== 'processing' && page.status !== 'queued') return page
          const exists = page.blocks.some((block) => block.id === action.block.id)
          return {
            ...page,
            blocks: exists
              ? page.blocks.map((block) => (block.id === action.block.id ? action.block : block))
              : [...page.blocks, action.block],
          }
        }),
      }

    case 'PAGE_WARNING':
      return {
        ...state,
        pages: updatePage(state, action.pageId, (page) => ({
          ...page,
          warnings: page.warnings.includes(action.message)
            ? page.warnings
            : [...page.warnings, action.message],
        })),
      }

    case 'PAGE_DONE': {
      const page = state.pages.find((item) => item.id === action.pageId)
      if (!page) return state
      const title =
        !state.titleTouched && !state.title
          ? action.title || titleFromBlocks(action.blocks, page.name)
          : state.title
      return {
        ...state,
        title,
        pages: updatePage(state, action.pageId, (item) => ({
          ...item,
          status: 'done',
          blocks: action.blocks,
          detectedLanguage: action.detectedLanguage,
          warnings: action.warnings,
          meta: action.meta,
          error: null,
        })),
      }
    }

    case 'PAGE_ERROR':
      return {
        ...state,
        pages: updatePage(state, action.pageId, (page) => ({
          ...page,
          status: 'error',
          error: action.error,
        })),
      }

    case 'RESET_PAGE':
      return {
        ...state,
        pages: updatePage(state, action.pageId, (page) => ({
          ...page,
          status: 'queued',
          blocks: [],
          warnings: [],
          detectedLanguage: null,
          meta: null,
          error: null,
        })),
      }

    case 'EDIT_BLOCK': {
      const page = state.pages.find((item) => item.id === action.pageId)
      const block = page?.blocks.find((item) => item.id === action.blockId)
      if (!page || !block || block.text === action.text) return state

      const coalesce =
        state.lastEdit?.blockId === action.blockId && action.at - state.lastEdit.at < 1200
      const pages = updatePage(state, action.pageId, (item) =>
        updateBlock(item, action.blockId, (current) => ({ ...current, text: action.text })),
      )
      if (coalesce) {
        return {
          ...state,
          pages,
          translation: markTranslationStale(state.translation),
          lastEdit: { blockId: action.blockId, at: action.at },
        }
      }
      return {
        ...pushUndo(state, pages),
        lastEdit: { blockId: action.blockId, at: action.at },
      }
    }

    case 'CHANGE_BLOCK_TYPE': {
      const pages = updatePage(state, action.pageId, (page) =>
        updateBlock(page, action.blockId, (block) => ({
          ...block,
          type: action.blockType,
        })),
      )
      return pushUndo(state, pages)
    }

    case 'DELETE_BLOCK': {
      const pages = updatePage(state, action.pageId, (page) => ({
        ...page,
        blocks: page.blocks.filter((block) => block.id !== action.blockId),
      }))
      return {
        ...pushUndo(state, pages),
        selectedBlockId: state.selectedBlockId === action.blockId ? null : state.selectedBlockId,
      }
    }

    case 'SET_SELECTED_BLOCK':
      return {
        ...state,
        selectedBlockId: action.blockId,
        activePageId: action.pageId ?? state.activePageId,
      }

    case 'SET_HOVERED_BLOCK':
      return { ...state, hoveredBlockId: action.blockId }

    case 'SET_TARGET_LANG':
      if (state.targetLang === action.targetLang) return state
      return {
        ...state,
        targetLang: action.targetLang,
        translation:
          state.translation?.targetLang === action.targetLang ? state.translation : null,
      }

    case 'SET_TITLE':
      return { ...state, title: action.title, titleTouched: true }

    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.viewMode }

    case 'SET_REVIEW_MODE':
      return { ...state, reviewMode: action.reviewMode }

    case 'MARK_REVIEWED':
      return { ...state, reviewed: { ...state.reviewed, [action.blockId]: true } }

    case 'UNMARK_REVIEWED': {
      const reviewed = { ...state.reviewed }
      delete reviewed[action.blockId]
      return { ...state, reviewed }
    }

    case 'TRANSLATION_START':
      return {
        ...state,
        translation: {
          targetLang: action.targetLang,
          status: 'streaming',
          blocks:
            state.translation?.targetLang === action.targetLang ? state.translation.blocks : {},
          meta: null,
          error: null,
          stale: false,
        },
      }

    case 'TRANSLATION_BLOCK': {
      const current = state.translation
      if (!current) return state
      return {
        ...state,
        translation: {
          ...current,
          status: 'streaming',
          blocks: { ...current.blocks, [action.blockId]: action.text },
        },
      }
    }

    case 'TRANSLATION_DONE': {
      const current = state.translation
      if (!current) return state
      const blocks = { ...current.blocks }
      for (const block of action.blocks) blocks[block.id] = block.text
      return {
        ...state,
        translation: {
          ...current,
          status: 'done',
          blocks,
          meta: action.meta,
          error: null,
          stale: current.stale,
        },
      }
    }

    case 'TRANSLATION_ERROR':
      return {
        ...state,
        translation: state.translation
          ? { ...state.translation, status: 'error', error: action.error }
          : null,
      }

    case 'EDIT_TRANSLATION': {
      if (!state.translation) return state
      return {
        ...state,
        translation: {
          ...state.translation,
          blocks: { ...state.translation.blocks, [action.blockId]: action.text },
        },
      }
    }

    case 'LOAD_NOTE':
      return {
        ...action.note,
        selectedBlockId: null,
        hoveredBlockId: null,
        reviewMode: false,
        viewMode: 'edit',
        undo: [],
        redo: [],
        lastEdit: null,
      }

    case 'RESET':
      return action.note

    case 'UNDO': {
      const previous = state.undo[state.undo.length - 1]
      if (!previous) return state
      return {
        ...state,
        pages: previous,
        undo: state.undo.slice(0, -1),
        redo: [state.pages, ...state.redo].slice(0, 40),
        translation: markTranslationStale(state.translation),
        selectedBlockId: null,
        lastEdit: null,
      }
    }

    case 'REDO': {
      const next = state.redo[0]
      if (!next) return state
      return {
        ...state,
        pages: next,
        undo: [...state.undo, state.pages].slice(-40),
        redo: state.redo.slice(1),
        translation: markTranslationStale(state.translation),
        selectedBlockId: null,
        lastEdit: null,
      }
    }
  }
}
