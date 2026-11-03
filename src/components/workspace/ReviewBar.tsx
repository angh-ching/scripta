import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Button } from '../ui/Button'
import styles from './ReviewBar.module.css'

interface ReviewBarProps {
  total: number
  currentIndex: number
  onPrev: () => void
  onNext: () => void
  onMarkReviewed: () => void
  onExit: () => void
}

export function ReviewBar({
  total,
  currentIndex,
  onPrev,
  onNext,
  onMarkReviewed,
  onExit,
}: ReviewBarProps) {
  const allReviewed = total === 0

  return (
    <div
      className={`${styles.bar} ${allReviewed ? styles.allReviewed : ''}`}
      role="region"
      aria-label="Confidence review"
    >
      <div className={styles.status}>
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.label}>
          {allReviewed ? (
            <>Every uncertain block reviewed</>
          ) : (
            <>
              Uncertain block
              <strong>
                {Math.max(1, currentIndex)} / {total}
              </strong>
            </>
          )}
        </span>
      </div>
      <div className={styles.actions}>
        <Button
          variant="quiet"
          size="sm"
          iconOnly
          icon={<ChevronLeft size={13} />}
          aria-label="Previous uncertain block"
          onClick={onPrev}
          disabled={allReviewed}
        />
        <Button
          variant="quiet"
          size="sm"
          iconOnly
          icon={<ChevronRight size={13} />}
          aria-label="Next uncertain block"
          onClick={onNext}
          disabled={allReviewed}
        />
        <Button
          variant="primary"
          size="sm"
          icon={<Check size={12} />}
          onClick={onMarkReviewed}
          disabled={allReviewed}
        >
          Looks right
        </Button>
        <Button
          variant="quiet"
          size="sm"
          iconOnly
          icon={<X size={13} />}
          aria-label="Exit review"
          onClick={onExit}
        />
      </div>
    </div>
  )
}
