import { useEffect, useRef, useState } from 'react'
import { makeStoredNote, saveNote } from '../../lib/storage'
import type { NoteState, SavedStatus } from '../workspace/types'

export function useAutosave(note: NoteState, enabled: boolean) {
  const [status, setStatus] = useState<SavedStatus>(enabled ? 'idle' : 'off')
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const savedAtRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) {
      setStatus('off')
      return
    }

    const stored = makeStoredNote(note)
    if (!stored) {
      setStatus('idle')
      return
    }

    let cancelled = false
    setStatus('saving')
    const timer = window.setTimeout(() => {
      void saveNote(stored)
        .then(() => {
          if (cancelled) return
          const now = Date.now()
          savedAtRef.current = now
          setSavedAt(now)
          setStatus('saved')
        })
        .catch(() => {
          if (cancelled) return
          setStatus('error')
        })
    }, 850)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
    // The effect deliberately keys off the fields makeStoredNote reads, not the whole
    // state object, so selecting or hovering a block does not restart the save timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see note above
  }, [
    enabled,
    note.id,
    note.title,
    note.createdAt,
    note.targetLang,
    note.pages,
    note.translation,
    note.reviewed,
  ])

  return { status, savedAt, savedAtRef }
}
