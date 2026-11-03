import { Command, CornerDownLeft, Keyboard, MoveVertical } from 'lucide-react'
import { Dialog } from '../ui/Dialog'
import styles from './ShortcutsDialog.module.css'

interface ShortcutsDialogProps {
  open: boolean
  onClose: () => void
}

function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export function ShortcutsDialog({ open, onClose }: ShortcutsDialogProps) {
  const mac = isMacPlatform()
  const mod = mac ? '⌘' : 'Ctrl'
  const alt = mac ? '⌥' : 'Alt'

  const rows: { group: string; items: { keys: string[]; label: string }[] }[] = [
    {
      group: 'Reading',
      items: [
        { keys: [mod, '↵'], label: 'Translate the whole note' },
        { keys: ['R'], label: 'Start or stop confidence review' },
        { keys: [alt, '↑'], label: 'Previous block' },
        { keys: [alt, '↓'], label: 'Next block' },
      ],
    },
    {
      group: 'Editing',
      items: [
        { keys: [mod, 'Z'], label: 'Undo a transcript edit' },
        { keys: [mod, '⇧', 'Z'], label: 'Redo' },
        { keys: ['Esc'], label: 'Exit review or close a dialog' },
      ],
    },
    {
      group: 'The desk',
      items: [
        { keys: ['?'], label: 'Show this shortcut sheet' },
        { keys: ['Tab'], label: 'Move through controls' },
        { keys: ['Space'], label: 'Choose the focused button' },
      ],
    },
  ]

  return (
    <Dialog
      open={open}
      onClose={onClose}
      eyebrow="Reference"
      title="Keyboard shortcuts"
      className={styles.dialog}
    >
      <div className={styles.intro}>
        <span className={styles.badge}>
          <Keyboard size={14} aria-hidden="true" />
          Built for quiet hands
        </span>
        <p>
          Shortcuts pause while you are typing, so a stray keystroke never rewrites the page.
        </p>
      </div>

      <div className={styles.groups}>
        {rows.map((group) => (
          <section key={group.group} className={styles.group} aria-label={group.group}>
            <h3>{group.group}</h3>
            <dl className={styles.list}>
              {group.items.map((item) => (
                <div key={item.label} className={styles.row}>
                  <dt>{item.label}</dt>
                  <dd>
                    {item.keys.map((key) => (
                      <kbd key={key} className={styles.key}>
                        {key}
                      </kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <footer className={styles.footer}>
        <span>
          <Command size={12} aria-hidden="true" />
          {mac ? 'Command' : 'Control'} is the modifier on this device.
        </span>
        <span>
          <MoveVertical size={12} aria-hidden="true" />
          Alt + arrows jump between transcribed blocks.
        </span>
        <span>
          <CornerDownLeft size={12} aria-hidden="true" />
          Press ? again to close.
        </span>
      </footer>
    </Dialog>
  )
}
