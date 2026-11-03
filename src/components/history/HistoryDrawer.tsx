import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Database,
  FileClock,
  LoaderCircle,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { clearNotes, deleteNote, listNotes, storageEstimate } from '../../lib/storage'
import { formatBytes, formatRelativeTime } from '../../lib/id'
import { languageNativeName } from '../../../shared/languages'
import type { StoredNote } from '../../features/workspace/types'
import { Button } from '../ui/Button'
import styles from './HistoryDrawer.module.css'

interface HistoryDrawerProps {
  open: boolean
  onClose: () => void
  onLoad: (note: StoredNote) => void
}

export function HistoryDrawer({ open, onClose, onLoad }: HistoryDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const urlsRef = useRef(new Map<string, string>())
  const [notes, setNotes] = useState<StoredNote[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [records, estimate] = await Promise.all([listNotes(), storageEstimate()])
        if (cancelled) return

        for (const url of urlsRef.current.values()) URL.revokeObjectURL(url)
        urlsRef.current.clear()

        setNotes(records)
        setStorage(estimate)
      } catch {
        if (!cancelled) setError('Local history could not be opened in this browser.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [open, reloadKey])

  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- revoke whatever URLs exist at unmount
      for (const url of urlsRef.current.values()) URL.revokeObjectURL(url)
      urlsRef.current.clear()
    }
  }, [])

  const thumbnail = (note: StoredNote): string | undefined => {
    const cached = urlsRef.current.get(note.id)
    if (cached) return cached
    const page = note.pages[0]
    if (!page) return undefined
    const url = URL.createObjectURL(page.blob)
    urlsRef.current.set(note.id, url)
    return url
  }

  const removeNote = async (note: StoredNote) => {
    if (!window.confirm(`Delete “${note.title}” from local history? This cannot be undone.`)) {
      return
    }
    try {
      await deleteNote(note.id)
      const url = urlsRef.current.get(note.id)
      if (url) {
        URL.revokeObjectURL(url)
        urlsRef.current.delete(note.id)
      }
      setNotes((current) => current.filter((item) => item.id !== note.id))
      toast('Removed from history')
    } catch {
      toast.error('That note could not be removed.')
    }
  }

  const clearAll = async () => {
    if (!window.confirm('Delete every note stored in this browser? This cannot be undone.')) return
    try {
      await clearNotes()
      for (const url of urlsRef.current.values()) URL.revokeObjectURL(url)
      urlsRef.current.clear()
      setNotes([])
      toast('Local history cleared')
    } catch {
      toast.error('Local history could not be cleared.')
    }
  }

  const usagePercent =
    storage && storage.quota > 0 ? Math.min(100, (storage.usage / storage.quota) * 100) : 0

  return (
    <dialog
      ref={dialogRef}
      className={styles.drawer}
      aria-labelledby="history-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClose={onClose}
      onPointerDown={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
    >
      <div className={styles.inner}>
        <header className={styles.header}>
          <div>
            <div className={styles.eyebrow}>Local archive</div>
            <h2 id="history-title" className={styles.title}>
              History
            </h2>
            <p className={styles.subhead}>
              Saved in this browser only — never on a Scripta server.
            </p>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close history">
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className={styles.body}>
          {loading ? (
            <div className={styles.loading} role="status">
              <LoaderCircle size={16} className={styles.spin} aria-hidden="true" />
              Opening the archive…
            </div>
          ) : error ? (
            <div className={styles.message}>
              <Database size={20} aria-hidden="true" />
              <h3>The archive is unavailable.</h3>
              <p>{error}</p>
              <Button
                variant="secondary"
                size="sm"
                icon={<RotateCcw size={12} />}
                onClick={() => setReloadKey((value) => value + 1)}
              >
                Try again
              </Button>
            </div>
          ) : notes.length === 0 ? (
            <div className={styles.message}>
              <FileClock size={22} aria-hidden="true" />
              <h3>Nothing archived yet.</h3>
              <p>
                When a scan finishes reading, it is autosaved here with its pages, transcript and
                translation. Images stay compressed in IndexedDB.
              </p>
              <Button variant="secondary" size="sm" onClick={onClose}>
                Back to the desk
              </Button>
            </div>
          ) : (
            <div className={styles.list}>
              {notes.map((note) => {
                const image = thumbnail(note)
                const language = note.pages[0]?.detectedLanguage
                return (
                  <article key={note.id} className={styles.item}>
                    <button
                      type="button"
                      className={styles.itemMain}
                      onClick={() => {
                        onLoad(note)
                        onClose()
                      }}
                      aria-label={`Open ${note.title}`}
                    >
                      <span className={styles.thumbFrame}>
                        {image ? <img src={image} alt="" loading="lazy" /> : null}
                        <span className={styles.thumbCount}>
                          {note.pages.length} page{note.pages.length === 1 ? '' : 's'}
                        </span>
                      </span>
                      <span className={styles.itemText}>
                        <span className={styles.itemTitle}>{note.title}</span>
                        <span className={styles.itemMeta}>
                          {formatRelativeTime(note.updatedAt)}
                          {language ? ` · ${language.name}` : ''}
                          {note.translation ? ` · ${languageNativeName(note.translation.targetLang)}` : ''}
                        </span>
                        <span className={styles.itemPreview}>
                          {note.pages[0]?.blocks.find((block) => block.text.trim())?.text ?? ''}
                        </span>
                      </span>
                      <ArrowRight size={15} className={styles.itemArrow} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={styles.delete}
                      onClick={() => void removeNote(note)}
                      aria-label={`Delete ${note.title}`}
                      title="Delete from history"
                    >
                      <Trash2 size={13} aria-hidden="true" />
                    </button>
                  </article>
                )
              })}
            </div>
          )}
        </div>

        <footer className={styles.footer}>
          {storage ? (
            <div className={styles.storage}>
              <div className={styles.storageRow}>
                <span>Browser storage</span>
                <span>
                  {formatBytes(storage.usage)} of {formatBytes(storage.quota)}
                </span>
              </div>
              <div className={styles.meter}>
                <span style={{ width: `${Math.max(1, usagePercent)}%` }} />
              </div>
            </div>
          ) : (
            <span className={styles.storageFallback}>Local storage only</span>
          )}
          {notes.length > 0 ? (
            <Button variant="danger" size="sm" icon={<Trash2 size={12} />} onClick={() => void clearAll()}>
              Clear all
            </Button>
          ) : null}
        </footer>
      </div>
    </dialog>
  )
}
