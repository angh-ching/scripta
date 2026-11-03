import { useEffect, useRef } from 'react'
import {
  AlertTriangle,
  Check,
  Copy,
  Eye,
  PencilLine,
  Redo2,
  RotateCcw,
  ScanText,
  TriangleAlert,
  Undo2,
} from 'lucide-react'
import clsx from 'clsx'
import type { BlockType } from '../../../shared/contracts'
import { blocksToMarkdown } from '../../../shared/blocks'
import type { NoteState } from '../../features/workspace/types'
import { documentWordCount } from '../../features/workspace/selectors'
import { BlockEditor } from '../editor/BlockEditor'
import { MarkdownPreview } from '../editor/MarkdownView'
import { Button } from '../ui/Button'
import { ReviewBar } from './ReviewBar'
import styles from './TranscriptPane.module.css'

interface TranscriptPaneProps {
  note: NoteState
  lowCount: number
  reviewIndex: number
  canUndo: boolean
  canRedo: boolean
  onSelectBlock: (blockId: string | null, pageId?: string) => void
  onHoverBlock: (blockId: string | null) => void
  onEditBlock: (pageId: string, blockId: string, text: string) => void
  onChangeType: (pageId: string, blockId: string, type: BlockType) => void
  onDeleteBlock: (pageId: string, blockId: string) => void
  onMarkReviewed: (blockId: string) => void
  onSetViewMode: (mode: 'edit' | 'preview') => void
  onUndo: () => void
  onRedo: () => void
  onToggleReview: () => void
  onReviewPrev: () => void
  onReviewNext: () => void
  onReviewMarkCurrent: () => void
  onReviewExit: () => void
  onRetryPage: (pageId: string) => void
  onCopy: () => void
}

export function TranscriptPane({
  note,
  lowCount,
  reviewIndex,
  canUndo,
  canRedo,
  onSelectBlock,
  onHoverBlock,
  onEditBlock,
  onChangeType,
  onDeleteBlock,
  onMarkReviewed,
  onSetViewMode,
  onUndo,
  onRedo,
  onToggleReview,
  onReviewPrev,
  onReviewNext,
  onReviewMarkCurrent,
  onReviewExit,
  onRetryPage,
  onCopy,
}: TranscriptPaneProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const words = documentWordCount(note)

  useEffect(() => {
    if (!note.selectedBlockId || !scrollRef.current) return
    const selector = `[data-block-id="${CSS.escape(note.selectedBlockId)}"]`
    const element = scrollRef.current.querySelector<HTMLElement>(selector)
    element?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [note.selectedBlockId])

  return (
    <section className={styles.pane} aria-label="Transcript">
      <header className={styles.header}>
        <div className={styles.heading}>
          <span className={styles.kicker}>Transcript</span>
          <span className={styles.stats}>
            {words} word{words === 1 ? '' : 's'}
          </span>
        </div>
        <div className={styles.actions}>
          {lowCount > 0 || note.reviewMode ? (
            <Button
              variant={note.reviewMode ? 'primary' : 'ghost'}
              size="sm"
              icon={note.reviewMode ? <Check size={12} /> : <TriangleAlert size={12} />}
              onClick={onToggleReview}
              title="Step through low-confidence blocks"
            >
              {note.reviewMode ? 'Reviewing' : `Review ${lowCount}`}
            </Button>
          ) : null}
          <div className={styles.segmented} role="group" aria-label="Transcript view">
            <button
              type="button"
              className={clsx(styles.segment, note.viewMode === 'edit' && styles.segmentActive)}
              aria-pressed={note.viewMode === 'edit'}
              onClick={() => onSetViewMode('edit')}
              title="Edit transcript"
            >
              <PencilLine size={12} aria-hidden="true" />
              <span>Edit</span>
            </button>
            <button
              type="button"
              className={clsx(styles.segment, note.viewMode === 'preview' && styles.segmentActive)}
              aria-pressed={note.viewMode === 'preview'}
              onClick={() => onSetViewMode('preview')}
              title="Preview formatted transcript"
            >
              <Eye size={12} aria-hidden="true" />
              <span>Preview</span>
            </button>
          </div>
          <span className={styles.actionDivider} aria-hidden="true" />
          <Button
            variant="quiet"
            size="sm"
            iconOnly
            icon={<Copy size={13} />}
            onClick={onCopy}
            aria-label="Copy transcript"
            title="Copy transcript"
          />
          <Button
            variant="quiet"
            size="sm"
            iconOnly
            icon={<Undo2 size={13} />}
            onClick={onUndo}
            disabled={!canUndo}
            aria-label="Undo"
            title="Undo"
          />
          <Button
            variant="quiet"
            size="sm"
            iconOnly
            icon={<Redo2 size={13} />}
            onClick={onRedo}
            disabled={!canRedo}
            aria-label="Redo"
            title="Redo"
          />
        </div>
      </header>

      <div className={styles.scroll} ref={scrollRef}>
        {note.pages.length === 0 ? (
          <EmptyTranscript />
        ) : (
          note.pages.map((page, pageIndex) => {
            const low = page.blocks.filter((block) => !note.reviewed[block.id] && block.confidence < 0.72)
            const language = page.detectedLanguage
            return (
              <section
                key={page.id}
                className={styles.pageSection}
                aria-label={`Page ${pageIndex + 1}`}
              >
                <div className={styles.pageHeader}>
                  <span className={styles.pageIndex}>Page {String(pageIndex + 1).padStart(2, '0')}</span>
                  {language ? (
                    <span className={styles.language}>
                      {language.name}
                      <span className={styles.confidence}>
                        {Math.round(language.confidence * 100)}%
                      </span>
                    </span>
                  ) : null}
                  <span className={styles.pageHeaderRule} aria-hidden="true" />
                  {page.status === 'processing' || page.status === 'queued' ? (
                    <span className={styles.readingStatus}>
                      <span className={styles.readingDot} />
                      reading
                    </span>
                  ) : null}
                  {page.status === 'error' ? (
                    <span className={styles.errorStatus}>unread</span>
                  ) : null}
                  {page.status === 'done' && low.length > 0 ? (
                    <span className={styles.reviewStatus}>{low.length} uncertain</span>
                  ) : null}
                  {page.status === 'done' && low.length === 0 ? (
                    <span className={styles.cleanStatus}>
                      <Check size={9} aria-hidden="true" /> read
                    </span>
                  ) : null}
                </div>

                {page.status === 'error' ? (
                  <div className={styles.pageError}>
                    <AlertTriangle size={15} aria-hidden="true" />
                    <div>
                      <strong>This page could not be read.</strong>
                      <p>{page.error?.message ?? 'Try a clearer photo.'}</p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<RotateCcw size={12} />}
                      onClick={() => onRetryPage(page.id)}
                    >
                      Retry
                    </Button>
                  </div>
                ) : null}

                {page.status === 'done' && page.blocks.length === 0 ? (
                  <div className={styles.blankPage}>
                    <ScanText size={18} aria-hidden="true" />
                    <p>No readable writing on this page.</p>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<RotateCcw size={12} />}
                      onClick={() => onRetryPage(page.id)}
                    >
                      Scan again
                    </Button>
                  </div>
                ) : null}

                {note.viewMode === 'edit' ? (
                  <div className={styles.blocks}>
                    {page.blocks.map((block) => (
                      <BlockEditor
                        key={block.id}
                        pageId={page.id}
                        block={block}
                        selected={note.selectedBlockId === block.id}
                        lowConfidence={block.confidence < 0.72}
                        reviewed={Boolean(note.reviewed[block.id])}
                        reviewMode={note.reviewMode}
                        onSelect={() => onSelectBlock(block.id, page.id)}
                        onHover={onHoverBlock}
                        onEdit={(text) => onEditBlock(page.id, block.id, text)}
                        onChangeType={(type) => onChangeType(page.id, block.id, type)}
                        onDelete={() => onDeleteBlock(page.id, block.id)}
                        onMarkReviewed={() => onMarkReviewed(block.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <MarkdownPreview
                    className={styles.preview}
                    markdown={blocksToMarkdown(page.blocks)}
                  />
                )}

                {(page.status === 'processing' || page.status === 'queued') && (
                  <div className={styles.streaming}>
                    {page.blocks.length === 0 ? (
                      <div className={styles.skeleton} aria-hidden="true">
                        {[88, 100, 74, 92].map((width, index) => (
                          <span key={index} style={{ width: `${width}%` }} />
                        ))}
                      </div>
                    ) : null}
                    <div className={styles.readingLine} role="status">
                      <span className={styles.readingDot} />
                      {page.status === 'queued' ? 'Waiting for a reader…' : 'Reading ink…'}
                      {page.blocks.length > 0 ? (
                        <span className={styles.blockTally}>{page.blocks.length} blocks so far</span>
                      ) : null}
                    </div>
                  </div>
                )}

                {page.warnings.length > 0 && page.status === 'done' ? (
                  <div className={styles.warnings}>
                    <AlertTriangle size={11} aria-hidden="true" />
                    <span>{page.warnings[0]}</span>
                    {page.warnings.length > 1 ? (
                      <span title={page.warnings.slice(1).join('\n')}>
                        +{page.warnings.length - 1}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {pageIndex < note.pages.length - 1 ? (
                  <div className={styles.pageBreak} aria-hidden="true">
                    <span />
                    <em>{String(pageIndex + 2).padStart(2, '0')}</em>
                    <span />
                  </div>
                ) : null}
              </section>
            )
          })
        )}
      </div>

      {note.reviewMode ? (
        <ReviewBar
          total={lowCount}
          currentIndex={reviewIndex + 1}
          onPrev={onReviewPrev}
          onNext={onReviewNext}
          onMarkReviewed={onReviewMarkCurrent}
          onExit={onReviewExit}
        />
      ) : null}
    </section>
  )
}

function EmptyTranscript() {
  return (
    <div className={styles.empty}>
      <ScanText size={24} aria-hidden="true" />
      <h3>Your transcript will live here.</h3>
      <p>Add a page and Scripta will place every line where it belongs.</p>
    </div>
  )
}
