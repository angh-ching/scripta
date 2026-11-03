import type { ApiError, Block, DetectedLanguage, OcrMeta } from '../../../shared/contracts'

export type PageStatus = 'queued' | 'processing' | 'done' | 'error'
export type ViewMode = 'edit' | 'preview'

export interface SourcePage {
  id: string
  name: string
  status: PageStatus
  blob: Blob
  previewUrl: string
  width: number
  height: number
  blocks: Block[]
  detectedLanguage: DetectedLanguage | null
  warnings: string[]
  meta: OcrMeta | null
  error: ApiError | null
}

export interface TranslationMeta {
  model: string
  ms: number
  cached: boolean
}

export interface TranslationState {
  targetLang: string
  status: 'streaming' | 'done' | 'error'
  blocks: Record<string, string>
  meta: TranslationMeta | null
  error: ApiError | null
  stale: boolean
}

export interface LastEdit {
  blockId: string
  at: number
}

export interface NoteState {
  id: string
  title: string
  titleTouched: boolean
  createdAt: number
  pages: SourcePage[]
  activePageId: string | null
  selectedBlockId: string | null
  hoveredBlockId: string | null
  targetLang: string
  translation: TranslationState | null
  reviewed: Record<string, true>
  reviewMode: boolean
  viewMode: ViewMode
  undo: SourcePage[][]
  redo: SourcePage[][]
  lastEdit: LastEdit | null
}

export interface PreparedImage {
  name: string
  blob: Blob
  previewUrl: string
  width: number
  height: number
}

export interface StoredPage {
  id: string
  name: string
  width: number
  height: number
  blob: Blob
  blocks: Block[]
  detectedLanguage: DetectedLanguage | null
  warnings: string[]
  meta: OcrMeta | null
}

export interface StoredNote {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  targetLang: string
  pages: StoredPage[]
  translation: TranslationState | null
  reviewed: Record<string, true>
}

export type SavedStatus = 'idle' | 'saving' | 'saved' | 'error' | 'off'
