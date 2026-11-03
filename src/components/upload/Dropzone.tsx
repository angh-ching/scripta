import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import {
  ArrowUpRight,
  Camera,
  FileImage,
  Highlighter,
  Languages,
  ScanLine,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import type { Health } from '../../../shared/contracts'
import { Button } from '../ui/Button'
import styles from './Dropzone.module.css'

interface DropzoneProps {
  health: Health | null
  healthError: string | null
  onFiles: (files: File[]) => Promise<unknown> | unknown
  onSample: () => Promise<unknown> | unknown
}

export function Dropzone({ health, healthError, onFiles, onSample }: DropzoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)

  const run = async (task: () => Promise<unknown> | unknown) => {
    if (busy) return
    setBusy(true)
    try {
      await task()
    } finally {
      setBusy(false)
    }
  }

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    void run(() => onFiles(Array.from(files)))
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    handleFiles(event.dataTransfer.files)
  }

  return (
    <main className={styles.landing}>
      <div className={styles.hero}>
        <section className={styles.copy}>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowLine} aria-hidden="true" />
            Handwriting → text → translation
          </div>
          <h1 className={styles.headline}>
            Read your
            <br />
            <em>handwriting.</em>
          </h1>
          <p className={styles.lede}>
            A photo of your notes becomes clean, editable text in seconds. Then read it in
            another language — without losing the shape, the math, or the meaning of the page.
          </p>

          <div className={styles.quickRow}>
            <Button
              variant="accent"
              size="lg"
              icon={<Sparkles size={16} />}
              loading={busy}
              onClick={() => void run(onSample)}
            >
              Try a sample note
            </Button>
            <span className={styles.quickHint}>No account. One click.</span>
          </div>

          <div className={styles.sampleSheet} aria-hidden="true">
            <div className={styles.sheetTape} />
            <div className={styles.sheetHeader}>
              <span>FIELD NOTES · 01</span>
              <span className={styles.sheetRule} />
            </div>
            <p className={styles.handTitle}>North Jetty</p>
            <p className={styles.handText}>
              The tide came in earlier than the{' '}
              <span className={styles.handHighlight}>almanac predicted.</span> I marked the
              high-water line with a blue peg...
            </p>
            <div className={styles.sheetFooter}>
              <span className={styles.sheetTag}>OCR</span>
              <span>EN · 04 blocks · 0.93</span>
            </div>
          </div>

          <div className={styles.trustRow}>
            <span>
              <ShieldCheck size={14} aria-hidden="true" /> Local history
            </span>
            <span>No server copies</span>
            <span>Gemini multimodal</span>
          </div>
        </section>

        <section className={styles.uploadColumn} aria-label="Upload a note">
          {health?.mode === 'mock' ? (
            <div className={`${styles.notice} ${styles.noticeDemo}`}>
              <strong>Demo mode.</strong> OCR and translation are simulated until a Gemini key
              is added.
            </div>
          ) : null}
          {health?.mode === 'unconfigured' ? (
            <div className={styles.notice}>
              <strong>Key needed.</strong> Add <code>GEMINI_API_KEY</code> to{' '}
              <code>.env.local</code>, then restart the server.
            </div>
          ) : null}
          {healthError ? (
            <div className={styles.notice}>
              <strong>Server offline.</strong> Start it with <code>npm run dev</code>.
            </div>
          ) : null}

          <div className={styles.paperStack}>
            <div className={styles.backSheet} />
            <div
              className={`${styles.dropCard} ${dragging ? styles.dragging : ''}`}
              onDragEnter={(event) => {
                event.preventDefault()
                dragDepth.current += 1
                setDragging(true)
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                event.preventDefault()
                dragDepth.current -= 1
                if (dragDepth.current <= 0) setDragging(false)
              }}
              onDrop={handleDrop}
            >
              <div className={styles.dropTop}>
                <span className={styles.formLabel}>NEW NOTE</span>
                <span className={styles.formNumber}>01</span>
              </div>

              <div className={styles.dropIllustration}>
                <FileImage size={30} strokeWidth={1.3} aria-hidden="true" />
                <div className={styles.scanRing} aria-hidden="true" />
              </div>
              <h2 className={styles.dropTitle}>
                Drop a page
                <span aria-hidden="true">,</span> paste a photo,
                <br />
                or choose a file.
              </h2>
              <p className={styles.dropCopy}>
                One note or twenty. We’ll keep the order, read each page, and hand it back
                editable.
              </p>

              <input
                ref={fileInputRef}
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                multiple
                onChange={(event) => {
                  handleFiles(event.target.files)
                  event.target.value = ''
                }}
                tabIndex={-1}
                aria-hidden="true"
              />
              <input
                ref={cameraInputRef}
                className="sr-only"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) => {
                  handleFiles(event.target.files)
                  event.target.value = ''
                }}
                tabIndex={-1}
                aria-hidden="true"
              />

              <div className={styles.dropActions}>
                <Button
                  variant="primary"
                  size="lg"
                  icon={<ArrowUpRight size={16} />}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                >
                  Choose notes
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  icon={<Camera size={16} />}
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={busy}
                >
                  Camera
                </Button>
              </div>

              <div className={styles.formats}>
                JPG · PNG · WebP <span aria-hidden="true">/</span> up to {health?.maxUploadMb ?? 12} MB
                each <span aria-hidden="true">/</span> 20 pages
              </div>
            </div>
          </div>

          <p className={styles.privacyNote}>
            <ShieldCheck size={13} aria-hidden="true" />
            Images are sent to Google Gemini to be read. They are never stored on a Scripta
            server. History stays in this browser.
          </p>
        </section>
      </div>

      <section className={styles.features} aria-label="How Scripta works">
        <Feature
          index="01"
          icon={<ScanLine size={18} />}
          title="Every block, placed"
          copy="Live bounding boxes tie each line back to the ink it came from. No blank-page guessing."
        />
        <Feature
          index="02"
          icon={<Highlighter size={18} />}
          title="Doubt, made visible"
          copy="Low-confidence words are marked for review, so you can fix the two words that matter."
        />
        <Feature
          index="03"
          icon={<Languages size={18} />}
          title="The whole page, translated"
          copy="Headings, lists, tables and LaTeX survive the crossing — 40+ languages, RTL included."
        />
        <Feature
          index="04"
          icon={<ShieldCheck size={18} />}
          title="Yours, quietly"
          copy="No accounts, no analytics, no server-side scans. History lives in IndexedDB and clears in one click."
        />
      </section>

      <footer className={styles.footer}>
        <span>Scripta / 2026</span>
        <span className={styles.footerRule} />
        <span>Built for ink that refuses to be retyped.</span>
      </footer>
    </main>
  )
}

function Feature({
  index,
  icon,
  title,
  copy,
}: {
  index: string
  icon: ReactNode
  title: string
  copy: string
}) {
  return (
    <article className={styles.feature}>
      <div className={styles.featureTop}>
        <span className={styles.featureIndex}>{index}</span>
        <span className={styles.featureIcon}>{icon}</span>
      </div>
      <h3>{title}</h3>
      <p>{copy}</p>
    </article>
  )
}
