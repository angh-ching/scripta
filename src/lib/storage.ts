import { openDB, type DBSchema } from 'idb'
import type { NoteState, StoredNote, TranslationState } from '../features/workspace/types'

interface ScriptaDB extends DBSchema {
  notes: {
    key: string
    value: StoredNote
    indexes: { 'by-updated': number }
  }
}

const DB_NAME = 'scripta-history'
const DB_VERSION = 1
const MAX_NOTES = 30

const dbPromise = openDB<ScriptaDB>(DB_NAME, DB_VERSION, {
  upgrade(database) {
    const store = database.createObjectStore('notes', { keyPath: 'id' })
    store.createIndex('by-updated', 'updatedAt')
  },
})

export function makeStoredNote(note: NoteState): StoredNote | null {
  const pages = note.pages
    .filter((page) => page.blocks.length > 0 && page.status === 'done')
    .map((page) => ({
      id: page.id,
      name: page.name,
      width: page.width,
      height: page.height,
      blob: page.blob,
      blocks: page.blocks,
      detectedLanguage: page.detectedLanguage,
      warnings: page.warnings,
      meta: page.meta,
    }))

  if (pages.length === 0) return null

  const translation: TranslationState | null =
    note.translation && note.translation.status !== 'streaming'
      ? {
          ...note.translation,
          blocks: { ...note.translation.blocks },
        }
      : null

  return {
    id: note.id,
    title: note.title.trim() || 'Untitled scan',
    createdAt: note.createdAt,
    updatedAt: Date.now(),
    targetLang: note.targetLang,
    pages,
    translation,
    reviewed: { ...note.reviewed },
  }
}

export async function saveNote(note: StoredNote): Promise<void> {
  const database = await dbPromise
  await database.put('notes', note)
  const all = await database.getAllFromIndex('notes', 'by-updated')
  if (all.length > MAX_NOTES) {
    const excess = all.slice(0, all.length - MAX_NOTES)
    await Promise.all(excess.map((item) => database.delete('notes', item.id)))
  }
}

export async function listNotes(): Promise<StoredNote[]> {
  const database = await dbPromise
  const notes = await database.getAllFromIndex('notes', 'by-updated')
  return notes.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function deleteNote(id: string): Promise<void> {
  const database = await dbPromise
  await database.delete('notes', id)
}

export async function clearNotes(): Promise<void> {
  const database = await dbPromise
  await database.clear('notes')
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null
  try {
    const estimate = await navigator.storage.estimate()
    return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 }
  } catch {
    return null
  }
}
