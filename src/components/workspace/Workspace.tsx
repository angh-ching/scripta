import { useCallback, useEffect, useMemo, useState, type Dispatch } from 'react'
import {
  Braces,
  Check,
  ClipboardCopy,
  CloudOff,
  Database,
  Download,
  FileDown,
  FileText,
  HardDriveDownload,
  LoaderCircle,
  Lock,
  Printer,
  TriangleAlert,
} from 'lucide-react'
import { toast } from 'sonner'
import clsx from 'clsx'
import type { BlockType, Health } from '../../../shared/contracts'
import type { WorkspaceAction } from '../../features/workspace/reducer'
import type { NoteState, SavedStatus } from '../../features/workspace/types'
import {
  documentLanguage,
  documentWordCount,
  lastModel,
  lowConfidenceLocations,
  unreviewedLocations,
} from '../../features/workspace/selectors'
import { Button } from '../ui/Button'
import { Menu } from '../ui/Menu'
import { SourcePane } from './SourcePane'
import { TranscriptPane } from './TranscriptPane'
import { TranslationPane } from './TranslationPane'
import styles from './Workspace.module.css'

type MobileTab = 'source' | 'transcript' | 'translation'

interface ExportActions {
  markdown: () => void
  plain: () => void
  json: () => void
  print: () => void
}

interface WorkspaceProps {
  note: NoteState
  dispatch: Dispatch<WorkspaceAction>
  health: Health | null
  autosaveStatus: SavedStatus
  savedAt: number | null
  busy: boolean
  onAddFiles: (files: File[]) => void
  onRemovePage: (pageId: string) => void
  onRetryPage: (pageId: string) => void
  onTranslate: () => void
  onCancelTranslation: () => void
  onSetTargetLang: (code: string) => void
  onCopyTranscript: () => void
  onCopyTranslation: () => void
  onOpenHistory: () => void
  exports: ExportActions
}

export function Workspace({
  note,
  dispatch,
  health,
  autosaveStatus,
  savedAt,
  busy,
  onAddFiles,
  onRemovePage,
  onRetryPage,
  onTranslate,
  onCancelTranslation,
  onSetTargetLang,
  onCopyTranscript,
  onCopyTranslation,
  onOpenHistory,
  exports,
}: WorkspaceProps) {
  const [mobileTab, setMobileTab] = useState<MobileTab>('transcript')
  const lowLocations = useMemo(() => lowConfidenceLocations(note), [note])
  const unreviewed = useMemo(() => unreviewedLocations(note), [note])
  const reviewIndex = Math.max(
    0,
    unreviewed.findIndex(({ block }) => block.id === note.selectedBlockId),
  )
  const reviewCurrent = unreviewed[reviewIndex]
  const words = documentWordCount(note)
  const language = documentLanguage(note)
  const model = lastModel(note) ?? health?.model ?? null
  const donePages = note.pages.filter((page) => page.status === 'done').length
  const activePage = note.pages.find((page) => page.id === note.activePageId) ?? note.pages[0]

  const selectLocation = useCallback(
    (blockId: string, pageId: string) => {
      dispatch({ type: 'SET_SELECTED_BLOCK', blockId, pageId })
    },
    [dispatch],
  )

  const toggleReview = useCallback(() => {
    if (note.reviewMode) {
      dispatch({ type: 'SET_REVIEW_MODE', reviewMode: false })
      return
    }
    dispatch({ type: 'SET_REVIEW_MODE', reviewMode: true })
    const first = unreviewed[0]
    if (first) {
      selectLocation(first.block.id, first.pageId)
      setMobileTab('transcript')
    }
  }, [dispatch, note.reviewMode, selectLocation, unreviewed])

  const stepReview = useCallback(
    (direction: -1 | 1) => {
      if (unreviewed.length === 0) return
      const nextIndex = (reviewIndex + direction + unreviewed.length) % unreviewed.length
      const next = unreviewed[nextIndex]
      if (next) selectLocation(next.block.id, next.pageId)
      setMobileTab('transcript')
    },
    [reviewIndex, selectLocation, unreviewed],
  )

  const markCurrentReviewed = useCallback(() => {
    if (!reviewCurrent) return
    dispatch({ type: 'MARK_REVIEWED', blockId: reviewCurrent.block.id })
    const remaining = unreviewed.filter(({ block }) => block.id !== reviewCurrent.block.id)
    const next = remaining[Math.min(reviewIndex, remaining.length - 1)]
    if (next) selectLocation(next.block.id, next.pageId)
    setMobileTab('transcript')
  }, [dispatch, reviewCurrent, reviewIndex, selectLocation, unreviewed])

  const markReviewed = useCallback(
    (blockId: string) => {
      dispatch({ type: 'MARK_REVIEWED', blockId })
    },
    [dispatch],
  )

  const exitReview = useCallback(() => {
    dispatch({ type: 'SET_REVIEW_MODE', reviewMode: false })
  }, [dispatch])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      const mod = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()

      if (mod && event.key === 'Enter') {
        event.preventDefault()
        if (!busy) onTranslate()
        return
      }
      if (mod && key === 'z') {
        event.preventDefault()
        dispatch({ type: event.shiftKey ? 'REDO' : 'UNDO' })
        return
      }
      if (!mod && key === 'r') {
        event.preventDefault()
        toggleReview()
        return
      }
      if (event.key === 'Escape' && note.reviewMode) {
        event.preventDefault()
        exitReview()
        return
      }
      if (event.altKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault()
        const locations = note.pages.flatMap((page) =>
          page.blocks.map((block) => ({ block, pageId: page.id })),
        )
        if (locations.length === 0) return
        const current = locations.findIndex(({ block }) => block.id === note.selectedBlockId)
        const nextIndex =
          current === -1
            ? 0
            : (current + (event.key === 'ArrowDown' ? 1 : -1) + locations.length) % locations.length
        const next = locations[nextIndex]
        if (next) selectLocation(next.block.id, next.pageId)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    busy,
    dispatch,
    exitReview,
    note.pages,
    note.reviewMode,
    note.selectedBlockId,
    onTranslate,
    selectLocation,
    toggleReview,
  ])

  const deleteBlock = (pageId: string, blockId: string) => {
    dispatch({ type: 'DELETE_BLOCK', pageId, blockId })
    toast('Block deleted', {
      action: { label: 'Undo', onClick: () => dispatch({ type: 'UNDO' }) },
    })
  }

  const exportItems = [
    {
      label: 'Markdown (.md)',
      icon: <FileDown size={14} />,
      onSelect: exports.markdown,
    },
    {
      label: 'Plain text (.txt)',
      icon: <FileText size={14} />,
      onSelect: exports.plain,
    },
    {
      label: 'Structured JSON',
      icon: <Braces size={14} />,
      onSelect: exports.json,
    },
    {
      label: 'Print / save PDF',
      icon: <Printer size={14} />,
      onSelect: exports.print,
    },
    {
      label: 'Copy transcript',
      icon: <ClipboardCopy size={14} />,
      onSelect: onCopyTranscript,
    },
  ]

  return (
    <div className={styles.workspace}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <div className={styles.titleRow}>
            <input
              className={styles.titleInput}
              value={note.title}
              onChange={(event) => dispatch({ type: 'SET_TITLE', title: event.target.value })}
              placeholder="Untitled scan"
              aria-label="Note title"
              spellCheck={false}
            />
            <span className={styles.titleMark} aria-hidden="true" />
          </div>
          <div className={styles.meta}>
            <span>{note.pages.length} page{note.pages.length === 1 ? '' : 's'}</span>
            {donePages < note.pages.length ? (
              <>
                <span className={styles.metaDot} />
                <span className={styles.metaBusy}>
                  <LoaderCircle size={9} className={styles.spin} aria-hidden="true" />
                  {note.pages.length - donePages} reading
                </span>
              </>
            ) : null}
            {language ? (
              <>
                <span className={styles.metaDot} />
                <span>
                  {language.name}
                  {language.mixed ? ' (mixed)' : ''}
                </span>
              </>
            ) : null}
            {activePage?.status === 'done' && activePage.detectedLanguage ? (
              <>
                <span className={styles.metaDot} />
                <span className={styles.metaMono}>
                  {Math.round(activePage.detectedLanguage.confidence * 100)}% match
                </span>
              </>
            ) : null}
          </div>
        </div>

        <div className={styles.headerActions}>
          {lowLocations.length > 0 || note.reviewMode ? (
            <Button
              variant={note.reviewMode ? 'primary' : 'secondary'}
              size="sm"
              icon={note.reviewMode ? <Check size={12} /> : <TriangleAlert size={12} />}
              onClick={toggleReview}
              title="Step through blocks the model was unsure about"
            >
              <span className={styles.reviewLabel}>
                {note.reviewMode ? 'Reviewing' : 'Review'}
              </span>
              {!note.reviewMode && unreviewed.length > 0 ? (
                <span className={styles.reviewCount}>{unreviewed.length}</span>
              ) : null}
            </Button>
          ) : null}
          <Menu
            label="Export"
            icon={<Download size={14} />}
            items={exportItems}
            size="sm"
            variant="secondary"
          />
        </div>
      </header>

      <nav className={styles.tabs} aria-label="Workspace panes">
        <TabButton
          active={mobileTab === 'source'}
          onClick={() => setMobileTab('source')}
          label="Source"
          badge={`${note.pages.length}`}
        />
        <TabButton
          active={mobileTab === 'transcript'}
          onClick={() => setMobileTab('transcript')}
          label="Transcript"
          badge={unreviewed.length > 0 ? `${unreviewed.length} to check` : `${words} words`}
          alert={unreviewed.length > 0}
        />
        <TabButton
          active={mobileTab === 'translation'}
          onClick={() => setMobileTab('translation')}
          label="Translation"
          badge={
            note.translation?.status === 'streaming'
              ? 'translating'
              : note.translation?.targetLang === note.targetLang
                ? 'ready'
                : 'not started'
          }
          alert={note.translation?.status === 'streaming'}
        />
      </nav>

      <div className={styles.panes}>
        <div
          className={clsx(
            styles.paneSlot,
            styles.sourceSlot,
            mobileTab === 'source' && styles.paneActive,
          )}
        >
          <SourcePane
            pages={note.pages}
            activePage={activePage}
            selectedBlockId={note.selectedBlockId}
            hoveredBlockId={note.hoveredBlockId}
            reviewMode={note.reviewMode}
            onSelectPage={(pageId) => dispatch({ type: 'SET_ACTIVE_PAGE', pageId })}
            onSelectBlock={(blockId, pageId) => {
              dispatch({
                type: 'SET_SELECTED_BLOCK',
                blockId,
                ...(pageId ? { pageId } : {}),
              })
            }}
            onHoverBlock={(blockId) => dispatch({ type: 'SET_HOVERED_BLOCK', blockId })}
            onAddFiles={onAddFiles}
            onRemovePage={onRemovePage}
            onRetryPage={onRetryPage}
          />
        </div>

        <div
          className={clsx(
            styles.paneSlot,
            styles.transcriptSlot,
            mobileTab === 'transcript' && styles.paneActive,
          )}
        >
          <TranscriptPane
            note={note}
            lowCount={unreviewed.length}
            reviewIndex={reviewIndex}
            canUndo={note.undo.length > 0}
            canRedo={note.redo.length > 0}
            onSelectBlock={(blockId, pageId) => {
              dispatch({
                type: 'SET_SELECTED_BLOCK',
                blockId,
                ...(pageId ? { pageId } : {}),
              })
            }}
            onHoverBlock={(blockId) => dispatch({ type: 'SET_HOVERED_BLOCK', blockId })}
            onEditBlock={(pageId, blockId, text) =>
              dispatch({ type: 'EDIT_BLOCK', pageId, blockId, text, at: Date.now() })
            }
            onChangeType={(pageId, blockId, type: BlockType) =>
              dispatch({ type: 'CHANGE_BLOCK_TYPE', pageId, blockId, blockType: type })
            }
            onDeleteBlock={deleteBlock}
            onMarkReviewed={markReviewed}
            onSetViewMode={(mode) => dispatch({ type: 'SET_VIEW_MODE', viewMode: mode })}
            onUndo={() => dispatch({ type: 'UNDO' })}
            onRedo={() => dispatch({ type: 'REDO' })}
            onToggleReview={toggleReview}
            onReviewPrev={() => stepReview(-1)}
            onReviewNext={() => stepReview(1)}
            onReviewMarkCurrent={markCurrentReviewed}
            onReviewExit={exitReview}
            onRetryPage={onRetryPage}
            onCopy={onCopyTranscript}
          />
        </div>

        <div
          className={clsx(
            styles.paneSlot,
            styles.translationSlot,
            mobileTab === 'translation' && styles.paneActive,
          )}
        >
          <TranslationPane
            note={note}
            ocrBusy={busy}
            onChangeTarget={onSetTargetLang}
            onTranslate={onTranslate}
            onCancel={onCancelTranslation}
            onEditTranslation={(blockId, text) =>
              dispatch({ type: 'EDIT_TRANSLATION', blockId, text })
            }
            onCopy={onCopyTranslation}
          />
        </div>
      </div>

      <footer className={styles.statusbar}>
        <button
          type="button"
          className={styles.saveState}
          onClick={onOpenHistory}
          title="Open local history"
        >
          <SaveIcon status={autosaveStatus} />
          <span>{saveLabel(autosaveStatus, savedAt)}</span>
        </button>

        <div className={styles.statusMeta}>
          {model ? (
            <>
              <span className={styles.model} title={`Read with ${model}`}>
                {model}
              </span>
              <span className={styles.statusDot} />
            </>
          ) : null}
          <span>{words} words</span>
          <span className={styles.statusDot} />
          <span>{note.pages.length} pages</span>
        </div>

        <div className={styles.statusRight}>
          <Database size={10} aria-hidden="true" />
          <span className={styles.localLabel}>History stays on this device</span>
          <Lock size={9} aria-hidden="true" />
          <span className={styles.privacyLabel}>Private by design</span>
        </div>
      </footer>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  label,
  badge,
  alert,
}: {
  active: boolean
  onClick: () => void
  label: string
  badge: string
  alert?: boolean
}) {
  return (
    <button
      type="button"
      className={clsx(styles.tab, active && styles.tabActive)}
      aria-pressed={active}
      onClick={onClick}
    >
      <span>{label}</span>
      <span className={clsx(styles.tabBadge, alert && styles.tabBadgeAlert)}>{badge}</span>
    </button>
  )
}

function SaveIcon({ status }: { status: SavedStatus }) {
  if (status === 'saving') {
    return <LoaderCircle size={11} className={styles.spin} aria-hidden="true" />
  }
  if (status === 'error') return <CloudOff size={11} aria-hidden="true" />
  if (status === 'saved') return <HardDriveDownload size={11} aria-hidden="true" />
  return <Database size={11} aria-hidden="true" />
}

function saveLabel(status: SavedStatus, savedAt: number | null): string {
  switch (status) {
    case 'saving':
      return 'Saving locally…'
    case 'saved':
      return savedAt
        ? `Saved locally · ${new Intl.DateTimeFormat(undefined, {
            hour: 'numeric',
            minute: '2-digit',
          }).format(savedAt)}`
        : 'Saved locally'
    case 'error':
      return 'Could not save locally'
    case 'off':
      return 'Autosave off'
    case 'idle':
      return 'Not saved yet'
  }
}
