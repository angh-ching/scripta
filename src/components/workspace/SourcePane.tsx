import { useRef, useState } from 'react'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  Minus,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import clsx from 'clsx'
import type { Block } from '../../../shared/contracts'
import { bboxStyle, isLowConfidence } from '../../../shared/blocks'
import type { SourcePage } from '../../features/workspace/types'
import { Button } from '../ui/Button'
import styles from './SourcePane.module.css'

interface SourcePaneProps {
  pages: SourcePage[]
  activePage: SourcePage | undefined
  selectedBlockId: string | null
  hoveredBlockId: string | null
  reviewMode: boolean
  onSelectPage: (pageId: string) => void
  onSelectBlock: (blockId: string | null, pageId?: string) => void
  onHoverBlock: (blockId: string | null) => void
  onAddFiles: (files: File[]) => void
  onRemovePage: (pageId: string) => void
  onRetryPage: (pageId: string) => void
}

export function SourcePane({
  pages,
  activePage,
  selectedBlockId,
  hoveredBlockId,
  reviewMode,
  onSelectPage,
  onSelectBlock,
  onHoverBlock,
  onAddFiles,
  onRemovePage,
  onRetryPage,
}: SourcePaneProps) {
  const [zoom, setZoom] = useState(100)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const activeIndex = activePage ? pages.findIndex((page) => page.id === activePage.id) : -1
  const busy = activePage?.status === 'processing' || activePage?.status === 'queued'

  const stepPage = (direction: -1 | 1) => {
    const nextIndex = activeIndex + direction
    const next = pages[nextIndex]
    if (next) onSelectPage(next.id)
  }

  const removeActive = () => {
    if (!activePage) return
    if (window.confirm(`Remove ${activePage.name} from this note?`)) {
      onRemovePage(activePage.id)
    }
  }

  return (
    <section className={styles.pane} aria-label="Source pages">
      <header className={styles.header}>
        <div className={styles.heading}>
          <span className={styles.kicker}>Source</span>
          <span className={styles.pageCount}>
            {activeIndex >= 0 ? String(activeIndex + 1).padStart(2, '0') : '—'}
            <span>/</span>
            {String(pages.length).padStart(2, '0')}
          </span>
        </div>
        <div className={styles.headerActions}>
          {activePage ? (
            <>
              <Button
                variant="quiet"
                size="sm"
                iconOnly
                icon={<ChevronLeft size={14} />}
                aria-label="Previous page"
                onClick={() => stepPage(-1)}
                disabled={activeIndex <= 0}
              />
              <Button
                variant="quiet"
                size="sm"
                iconOnly
                icon={<ChevronRight size={14} />}
                aria-label="Next page"
                onClick={() => stepPage(1)}
                disabled={activeIndex >= pages.length - 1}
              />
            </>
          ) : null}
          <Button
            variant="quiet"
            size="sm"
            iconOnly
            icon={<FilePlus2 size={14} />}
            aria-label="Add pages"
            title="Add pages"
            onClick={() => fileInputRef.current?.click()}
          />
          {activePage && pages.length > 1 ? (
            <Button
              variant="quiet"
              size="sm"
              iconOnly
              icon={<Trash2 size={13} />}
              aria-label="Remove this page"
              title="Remove this page"
              onClick={removeActive}
            />
          ) : null}
          <input
            ref={fileInputRef}
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple
            onChange={(event) => {
              const files = Array.from(event.target.files ?? [])
              event.target.value = ''
              if (files.length) onAddFiles(files)
            }}
            tabIndex={-1}
          />
        </div>
      </header>

      <div className={styles.viewer}>
        {activePage ? (
          <div className={styles.canvas}>
            <div className={styles.scaleArea} style={{ width: `${zoom}%` }}>
              <div className={styles.imageFrame}>
                <img
                  src={activePage.previewUrl}
                  alt={`Source page ${activeIndex + 1}: ${activePage.name}`}
                  draggable={false}
                />
                <div className={styles.overlay} aria-label="Transcribed regions">
                  {activePage.blocks.map((block) => (
                    <Region
                      key={block.id}
                      block={block}
                      selected={selectedBlockId === block.id}
                      hovered={hoveredBlockId === block.id}
                      low={isLowConfidence(block)}
                      dimmed={reviewMode && !isLowConfidence(block)}
                      onSelect={() => onSelectBlock(block.id, activePage.id)}
                      onHover={onHoverBlock}
                    />
                  ))}
                </div>
                {busy ? (
                  <div className={styles.scanState}>
                    <div className={styles.scanline} />
                    <span className={styles.scanLabel}>
                      <span className={styles.readingDot} />
                      {activePage.status === 'queued' ? 'Waiting to read…' : 'Reading ink…'}
                    </span>
                  </div>
                ) : null}
                {activePage.status === 'error' ? (
                  <div className={styles.errorOverlay}>
                    <AlertTriangle size={21} aria-hidden="true" />
                    <p>{activePage.error?.message ?? 'This page could not be read.'}</p>
                    <div className={styles.errorActions}>
                      <Button
                        variant="primary"
                        size="sm"
                        icon={<RotateCcw size={12} />}
                        onClick={() => onRetryPage(activePage.id)}
                      >
                        Try again
                      </Button>
                      {pages.length > 1 ? (
                        <Button variant="secondary" size="sm" onClick={removeActive}>
                          Remove page
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

          </div>
        ) : (
          <div className={styles.noPage}>No page selected.</div>
        )}
      </div>

      {activePage?.warnings.length ? (
        <div className={styles.warnings}>
          <AlertTriangle size={12} aria-hidden="true" />
          <span>{activePage.warnings[0]}</span>
          {activePage.warnings.length > 1 ? (
            <span className={styles.moreWarnings} title={activePage.warnings.slice(1).join('\n')}>
              +{activePage.warnings.length - 1}
            </span>
          ) : null}
        </div>
      ) : null}

      <footer className={styles.strip}>
        <div className={styles.thumbs} aria-label="Pages">
          {pages.map((page, index) => (
            <button
              key={page.id}
              type="button"
              className={clsx(
                styles.thumb,
                page.id === activePage?.id && styles.thumbActive,
                page.status === 'processing' && styles.thumbProcessing,
              )}
              onClick={() => onSelectPage(page.id)}
              aria-label={`Page ${index + 1}: ${page.name}`}
              aria-current={page.id === activePage?.id ? 'page' : undefined}
            >
              <img src={page.previewUrl} alt="" draggable={false} />
              <span className={styles.thumbNumber}>{String(index + 1).padStart(2, '0')}</span>
              <span className={styles.thumbStatus} data-status={page.status} />
            </button>
          ))}
          <button
            type="button"
            className={styles.addThumb}
            onClick={() => fileInputRef.current?.click()}
            aria-label="Add more pages"
          >
            <Plus size={15} aria-hidden="true" />
            <span>Add</span>
          </button>
        </div>
        {activePage ? (
          <div className={styles.pageMeta}>
            <div className={styles.pageInfo}>
              <span>
                {activePage.width} × {activePage.height}
              </span>
              <span className={styles.metaDivider} />
              <span title={activePage.name}>{activePage.name}</span>
            </div>
            <div className={styles.zoomControls} aria-label="Image zoom">
              <Button
                variant="quiet"
                size="sm"
                iconOnly
                icon={<Minus size={11} />}
                aria-label="Zoom out"
                onClick={() => setZoom((value) => Math.max(60, value - 15))}
                disabled={zoom <= 60}
              />
              <span>{zoom}%</span>
              <Button
                variant="quiet"
                size="sm"
                iconOnly
                icon={<Plus size={11} />}
                aria-label="Zoom in"
                onClick={() => setZoom((value) => Math.min(190, value + 15))}
                disabled={zoom >= 190}
              />
              <Button
                variant="quiet"
                size="sm"
                iconOnly
                icon={<RotateCcw size={11} />}
                aria-label="Reset zoom"
                onClick={() => setZoom(100)}
                disabled={zoom === 100}
              />
            </div>
          </div>
        ) : null}
      </footer>
    </section>
  )
}

function Region({
  block,
  selected,
  hovered,
  low,
  dimmed,
  onSelect,
  onHover,
}: {
  block: Block
  selected: boolean
  hovered: boolean
  low: boolean
  dimmed: boolean
  onSelect: () => void
  onHover: (blockId: string | null) => void
}) {
  if (!block.bbox) return null
  return (
    <button
      type="button"
      className={clsx(
        styles.region,
        selected && styles.regionSelected,
        hovered && styles.regionHovered,
        low && styles.regionLow,
        dimmed && styles.regionDimmed,
      )}
      style={bboxStyle(block.bbox)}
      title={block.text.slice(0, 120)}
      aria-label={`Select transcribed block: ${block.text.slice(0, 80)}`}
      onClick={(event) => {
        event.stopPropagation()
        onSelect()
      }}
      onMouseEnter={() => onHover(block.id)}
      onMouseLeave={() => onHover(null)}
    />
  )
}
