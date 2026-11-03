import { useCallback, useEffect, useState } from 'react'
import { Toaster, toast } from 'sonner'
import { useDigitizer } from './features/workspace/useDigitizer'
import type { StoredNote } from './features/workspace/types'
import { useAutosave } from './features/history/useAutosave'
import { useHealth } from './lib/useHealth'
import { useTheme } from './lib/useTheme'
import {
  copyText,
  downloadJson,
  downloadMarkdown,
  downloadPlainText,
  printNote,
  transcriptMarkdown,
  translationMarkdown,
} from './lib/export'
import { TopBar } from './components/workspace/TopBar'
import { Workspace } from './components/workspace/Workspace'
import { Dropzone } from './components/upload/Dropzone'
import { HistoryDrawer } from './components/history/HistoryDrawer'
import { ShortcutsDialog } from './components/help/ShortcutsDialog'
import styles from './App.module.css'

export default function App() {
  const digitizer = useDigitizer()
  const note = digitizer.state
  const { theme, toggleTheme } = useTheme()
  const { health, error: healthError } = useHealth()
  const autosave = useAutosave(note, note.pages.length > 0)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  const hasNote = note.pages.length > 0
  const busy = note.pages.some((page) => page.status === 'processing' || page.status === 'queued')

  const handleFiles = useCallback(
    async (files: File[]) => {
      const result = await digitizer.addFiles(files)
      if (result.errors.length > 0) {
        toast.error('Some pages were not added', {
          description: result.errors.slice(0, 2).join(' '),
        })
      } else if (result.added > 1) {
        toast(`Reading ${result.added} pages`, { description: 'Boxes and text will appear as each page finishes.' })
      }
    },
    [digitizer],
  )

  const handleSample = useCallback(async () => {
    const result = await digitizer.addSample()
    if (result.errors.length > 0) {
      toast.error('The sample could not be added', { description: result.errors[0] })
    }
  }, [digitizer])

  const handleNewScan = useCallback(() => {
    if (
      note.pages.length > 0 &&
      !window.confirm('Start a new note? This one is saved in local history once it has text.')
    ) {
      return
    }
    digitizer.reset()
  }, [digitizer, note.pages.length])

  const handleLoad = useCallback(
    (record: StoredNote) => {
      digitizer.loadNote(record)
      toast.success('Note opened', { description: record.title })
    },
    [digitizer],
  )

  const handleTranslate = useCallback(() => {
    if (busy) {
      toast('Still reading the page', { description: 'Translation unlocks when the transcript is ready.' })
      return
    }
    if (!note.pages.some((page) => page.blocks.some((block) => block.text.trim()))) {
      toast.error('Nothing to translate yet', { description: 'Add a page and let Scripta read it first.' })
      return
    }
    void digitizer.translate()
  }, [busy, digitizer, note.pages])

  const handleCopyTranscript = useCallback(async () => {
    const content = transcriptMarkdown(note)
    if (!content.trim()) {
      toast.error('There is no transcript to copy yet.')
      return
    }
    const copied = await copyText(content)
    if (copied) toast.success('Transcript copied')
    else toast.error('Clipboard access was blocked by the browser.')
  }, [note])

  const handleCopyTranslation = useCallback(async () => {
    const content = translationMarkdown(note)
    if (!content.trim()) {
      toast.error('Translate the note before copying.')
      return
    }
    const copied = await copyText(content)
    if (copied) toast.success('Translation copied')
    else toast.error('Clipboard access was blocked by the browser.')
  }, [note])

  const handlePrint = useCallback(() => {
    if (!printNote(note)) {
      toast.error('Printing was blocked', { description: 'Allow pop-ups for this site, then try again.' })
    }
  }, [note])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (event.key === '?') {
        event.preventDefault()
        setShortcutsOpen((value) => !value)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className={styles.shell}>
      <TopBar
        hasNote={hasNote}
        health={health}
        healthError={healthError}
        theme={theme}
        onNewScan={handleNewScan}
        onHistory={() => setHistoryOpen(true)}
        onHelp={() => setShortcutsOpen(true)}
        onToggleTheme={toggleTheme}
      />

      {hasNote ? (
        <Workspace
          note={note}
          dispatch={digitizer.dispatch}
          health={health}
          autosaveStatus={autosave.status}
          savedAt={autosave.savedAt}
          busy={busy}
          onAddFiles={(files) => void handleFiles(files)}
          onRemovePage={digitizer.removePage}
          onRetryPage={digitizer.retryPage}
          onTranslate={handleTranslate}
          onCancelTranslation={digitizer.cancelTranslation}
          onSetTargetLang={digitizer.setTargetLang}
          onCopyTranscript={() => void handleCopyTranscript()}
          onCopyTranslation={() => void handleCopyTranslation()}
          onOpenHistory={() => setHistoryOpen(true)}
          exports={{
            markdown: () => downloadMarkdown(note),
            plain: () => downloadPlainText(note),
            json: () => downloadJson(note),
            print: handlePrint,
          }}
        />
      ) : (
        <Dropzone
          health={health}
          healthError={healthError}
          onFiles={handleFiles}
          onSample={handleSample}
        />
      )}

      <HistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onLoad={handleLoad}
      />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      <Toaster
        theme={theme}
        position="bottom-right"
        closeButton
        toastOptions={{
          style: {
            background: 'var(--panel-strong)',
            color: 'var(--ink)',
            border: '1px solid var(--line)',
            borderRadius: '8px',
            fontFamily: 'var(--font-ui)',
            fontSize: '12px',
            boxShadow: 'var(--shadow-md)',
          },
        }}
      />
    </div>
  )
}
