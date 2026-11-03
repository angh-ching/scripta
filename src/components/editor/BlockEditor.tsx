import { useLayoutEffect, useRef, useState, lazy } from 'react'
import { Check, ChevronDown, Pencil, Trash2, TriangleAlert } from 'lucide-react'
import clsx from 'clsx'
import type { Block, BlockType } from '../../../shared/contracts'
import { BLOCK_TYPES } from '../../../shared/contracts'
import { blockTypeLabel } from '../../../shared/blocks'
import { Button } from '../ui/Button'
import { MarkdownPreview } from './MarkdownView'
import styles from './BlockEditor.module.css'

const MathView = lazy(() => import('./MathView').then((module) => ({ default: module.MathView })))

interface BlockEditorProps {
  pageId: string
  block: Block
  selected: boolean
  lowConfidence: boolean
  reviewed: boolean
  reviewMode: boolean
  onSelect: () => void
  onHover: (blockId: string | null) => void
  onEdit: (text: string) => void
  onChangeType: (type: BlockType) => void
  onDelete: () => void
  onMarkReviewed: () => void
}

function useAutoGrow(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    element.style.height = '0px'
    element.style.height = `${element.scrollHeight + 2}px`
  }, [value])
  return ref
}

export function BlockEditor({
  pageId,
  block,
  selected,
  lowConfidence,
  reviewed,
  reviewMode,
  onSelect,
  onHover,
  onEdit,
  onChangeType,
  onDelete,
  onMarkReviewed,
}: BlockEditorProps) {
  const textareaRef = useAutoGrow(block.text)
  const [formattedEditing, setFormattedEditing] = useState(false)
  const isFormatted = block.type === 'equation' || block.type === 'table'
  const showTextarea = !isFormatted || formattedEditing
  const confidencePercent = Math.round(block.confidence * 100)
  const flagged = lowConfidence && !reviewed

  return (
    <article
      data-block-id={block.id}
      data-page-id={pageId}
      className={clsx(
        styles.block,
        selected && styles.selected,
        flagged && styles.flagged,
        reviewed && styles.reviewed,
        reviewMode && styles.inReview,
      )}
      onMouseEnter={() => onHover(block.id)}
      onMouseLeave={() => onHover(null)}
    >
      <div className={styles.gutter} aria-hidden="true">
        {flagged ? <span className={styles.flagDot} /> : null}
      </div>

      <div className={styles.content}>
        <div className={styles.meta}>
          <label className={styles.typeControl}>
            <span className="sr-only">Block type</span>
            <select
              value={block.type}
              onChange={(event) => onChangeType(event.target.value as BlockType)}
              onClick={(event) => event.stopPropagation()}
              className={styles.typeSelect}
            >
              {BLOCK_TYPES.map((type) => (
                <option key={type} value={type}>
                  {blockTypeLabel(type)}
                </option>
              ))}
            </select>
            <ChevronDown size={10} aria-hidden="true" />
          </label>

          <span
            className={clsx(styles.confidence, flagged && styles.confidenceLow)}
            title={`Estimated legibility ${confidencePercent}% — a model estimate, not a calibrated probability.`}
          >
            {flagged ? <TriangleAlert size={10} aria-hidden="true" /> : null}
            {confidencePercent}%
          </span>

          {flagged ? (
            <span className={styles.reviewTag}>
              {reviewMode ? 'needs review' : 'uncertain'}
            </span>
          ) : null}

          <div className={styles.actions}>
            {flagged ? (
              <Button
                variant="quiet"
                size="sm"
                icon={<Check size={12} />}
                onClick={(event) => {
                  event.stopPropagation()
                  onMarkReviewed()
                }}
                title="Mark this block as correct"
              >
                Looks right
              </Button>
            ) : null}
            {isFormatted ? (
              <Button
                variant="quiet"
                size="sm"
                iconOnly
                icon={<Pencil size={12} />}
                aria-label={formattedEditing ? 'Preview formatted block' : 'Edit source'}
                title={formattedEditing ? 'Preview' : 'Edit source'}
                onClick={(event) => {
                  event.stopPropagation()
                  setFormattedEditing((value) => !value)
                  onSelect()
                }}
              />
            ) : null}
            <Button
              variant="quiet"
              size="sm"
              iconOnly
              icon={<Trash2 size={12} />}
              aria-label="Delete block"
              title="Delete block"
              onClick={(event) => {
                event.stopPropagation()
                onDelete()
              }}
            />
          </div>
        </div>

        {showTextarea ? (
          <textarea
            ref={textareaRef}
            value={block.text}
            rows={1}
            spellCheck
            dir="auto"
            aria-label={`${blockTypeLabel(block.type)} text`}
            className={clsx(
              styles.textarea,
              block.type === 'heading' && styles.heading,
              block.type === 'equation' && styles.equationSource,
              block.type === 'table' && styles.tableSource,
              block.type === 'code' && styles.code,
            )}
            placeholder="Nothing transcribed here…"
            onChange={(event) => onEdit(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onFocus={onSelect}
          />
        ) : null}

        {!showTextarea && block.type === 'equation' ? <MathView text={block.text} /> : null}

        {!showTextarea && block.type === 'table' ? (
          <MarkdownPreview markdown={block.text} className={styles.tablePreview} />
        ) : null}
      </div>
    </article>
  )
}
