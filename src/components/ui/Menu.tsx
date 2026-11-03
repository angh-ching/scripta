import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import clsx from 'clsx'
import { Button } from './Button'
import styles from './Menu.module.css'

export interface MenuItem {
  label: string
  icon?: ReactNode
  shortcut?: string
  onSelect: () => void
  danger?: boolean
}

interface MenuProps {
  label: string
  items: MenuItem[]
  icon?: ReactNode
  variant?: 'primary' | 'secondary' | 'ghost' | 'quiet'
  size?: 'md' | 'sm'
  align?: 'left' | 'right'
  disabled?: boolean
}

export function Menu({
  label,
  items,
  icon,
  variant = 'secondary',
  size = 'md',
  align = 'right',
  disabled,
}: MenuProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const menu = menuRef.current
    menu?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()

    const handlePointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        containerRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
      }
    }
    document.addEventListener('pointerdown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const moveFocus = (direction: 1 | -1) => {
    const buttons = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    )
    if (buttons.length === 0) return
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const nextIndex = (currentIndex + direction + buttons.length) % buttons.length
    buttons[nextIndex]?.focus()
  }

  return (
    <div className={styles.container} ref={containerRef}>
      <Button
        variant={variant}
        size={size}
        icon={icon}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
        <ChevronDown size={13} className={clsx(styles.chevron, open && styles.chevronOpen)} aria-hidden="true" />
      </Button>
      {open ? (
        <div
          ref={menuRef}
          className={clsx(styles.menu, align === 'right' ? styles.right : styles.left)}
          role="menu"
          tabIndex={-1}
          aria-label={label}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              moveFocus(1)
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              moveFocus(-1)
            }
          }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={clsx(styles.item, item.danger && styles.danger)}
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
            >
              <span className={styles.itemIcon}>{item.icon}</span>
              <span className={styles.itemLabel}>{item.label}</span>
              {item.shortcut ? <span className={styles.shortcut}>{item.shortcut}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
