import { History, Keyboard, Moon, Plus, Sun } from 'lucide-react'
import type { Health } from '../../../shared/contracts'
import { Button } from '../ui/Button'
import styles from './TopBar.module.css'

interface TopBarProps {
  hasNote: boolean
  health: Health | null
  healthError: string | null
  theme: 'light' | 'dark'
  onNewScan: () => void
  onHistory: () => void
  onHelp: () => void
  onToggleTheme: () => void
}

export function TopBar({
  hasNote,
  health,
  healthError,
  theme,
  onNewScan,
  onHistory,
  onHelp,
  onToggleTheme,
}: TopBarProps) {
  const demo = health?.mode === 'mock'
  const unconfigured = health?.mode === 'unconfigured'
  const keyName = health?.provider === 'openrouter' ? 'OPENROUTER_API_KEY' : 'GEMINI_API_KEY'

  return (
    <header className={styles.topbar}>
      <div className={styles.brandGroup}>
        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">
            <svg viewBox="0 0 28 28" width="25" height="25">
              <path
                d="M5.5 19.5c4.4-1 5.2-10.2 8.4-10.2 2.8 0 1.8 7 4 7 1.5 0 2.3-2 3.6-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              <circle cx="21.3" cy="7.7" r="1.25" fill="var(--accent)" />
            </svg>
          </span>
          <span className={styles.wordmark}>Scripta</span>
          <span className={styles.tagline}>handwriting, digitized</span>
        </div>
        {demo ? (
          <span
            className={styles.demoPill}
            title={`OCR and translation are simulated. Add ${keyName} for live scans.`}
          >
            demo
          </span>
        ) : null}
        {unconfigured ? (
          <span className={styles.warnPill} title={`${keyName} is missing from .env.local`}>
            key needed
          </span>
        ) : null}
        {healthError ? (
          <span className={styles.warnPill} title={healthError}>
            offline
          </span>
        ) : null}
      </div>

      <div className={styles.actions}>
        {hasNote ? (
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={onNewScan}>
            <span className={styles.actionLabel}>New scan</span>
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          icon={<History size={15} />}
          onClick={onHistory}
          aria-label="History"
        >
          <span className={styles.actionLabel}>History</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<Keyboard size={15} />}
          onClick={onHelp}
          aria-label="Keyboard shortcuts"
        >
          <span className={styles.actionLabel}>Shortcuts</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Use light theme' : 'Use dark theme'}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          iconOnly
        />
      </div>
    </header>
  )
}
