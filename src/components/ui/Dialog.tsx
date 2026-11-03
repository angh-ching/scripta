import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import clsx from 'clsx'
import styles from './Dialog.module.css'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  eyebrow?: string
  children: ReactNode
  wide?: boolean
  className?: string | undefined
}

export function Dialog({ open, onClose, title, eyebrow, children, wide, className }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      className={clsx(styles.dialog, wide && styles.wide, className)}
      aria-labelledby={titleId}
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
            {eyebrow ? <div className={styles.eyebrow}>{eyebrow}</div> : null}
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
          </div>
          <button className={styles.close} type="button" onClick={onClose} aria-label="Close dialog">
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className={styles.body}>{children}</div>
      </div>
    </dialog>
  )
}
