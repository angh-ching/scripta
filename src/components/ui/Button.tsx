import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'
import clsx from 'clsx'
import styles from './Button.module.css'

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'quiet' | 'danger'
type Size = 'md' | 'sm' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  iconOnly?: boolean
  loading?: boolean
  icon?: ReactNode
}

export function Button({
  variant = 'secondary',
  size = 'md',
  iconOnly = false,
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx(styles.button, styles[variant], styles[size], iconOnly && styles.iconOnly, className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <LoaderCircle className={styles.spinner} size={16} aria-hidden="true" /> : icon}
      {children ? <span className={styles.label}>{children}</span> : null}
    </button>
  )
}
