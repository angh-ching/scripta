import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ClipboardCopy,
  CornerDownRight,
  Languages,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  Square,
} from 'lucide-react'
import clsx from 'clsx'
import type { Block } from '../../../shared/contracts'
import { blockTypeLabel } from '../../../shared/blocks'
import {
  directionForLanguage,
  languageName,
  languageNativeName,
} from '../../../shared/languages'
import type { NoteState, TranslationState } from '../../features/workspace/types'
import { Button } from '../ui/Button'
import { LanguageSelector } from '../language/LanguageSelector'
import styles from './TranslationPane.module.css'

interface TranslationPaneProps {
  note: NoteState
  ocrBusy: boolean
  onChangeTarget: (code: string) => void
  onTranslate: () => void
  onCancel: () => void
  onEditTranslation: (blockId: string, text: string) => void
  onCopy: () => void
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

export function TranslationPane({
  note,
  ocrBusy,
  onChangeTarget,
  onTranslate,
  onCancel,
  onEditTranslation,
  onCopy,
}: TranslationPaneProps) {
  const translation =
    note.translation && note.translation.targetLang === note.targetLang ? note.translation : null
  const pages = note.pages.filter((page) => page.blocks.some((block) => block.text.trim()))
  const blockCount = pages.reduce(
    (total, page) => total + page.blocks.filter((block) => block.text.trim()).length,
    0,
  )
  const translatedCount = translation ? Object.keys(translation.blocks).length : 0
  const direction = directionForLanguage(note.targetLang)
  const targetLabel = languageName(note.targetLang)
  const targetNative = languageNativeName(note.targetLang)
  const done = translation?.status === 'done'
  const streaming = translation?.status === 'streaming'
  const errored = translation?.status === 'error'

  return (
    <section className={styles.pane} aria-label="Translation" dir="ltr">
      <header className={styles.header}>
        <div className={styles.heading}>
          <span className={styles.kicker}>Translation</span>
          {translation ? (
            <span className={styles.targetBadge}>{targetLabel}</span>
          ) : (
            <span className={styles.idleBadge}>not started</span>
          )}
        </div>
        <div className={styles.headerActions}>
          {done ? (
            <Button
              variant="quiet"
              size="sm"
              iconOnly
              icon={<ClipboardCopy size={13} />}
              aria-label="Copy translation"
              title="Copy translation"
              onClick={onCopy}
            />
          ) : null}
          {translation ? (
            <LanguageSelector
              value={note.targetLang}
              onChange={onChangeTarget}
              label=""
              ariaLabel="Translation language"
              compact
              align="right"
              disabled={streaming}
            />
          ) : null}
        </div>
      </header>

      <div className={styles.scroll}>
        {!translation ? (
          <TranslationIntro
            note={note}
            blockCount={blockCount}
            ocrBusy={ocrBusy}
            targetLabel={targetLabel}
            targetNative={targetNative}
            onChangeTarget={onChangeTarget}
            onTranslate={onTranslate}
          />
        ) : (
          <>
            {translation.stale ? (
              <div className={styles.staleBanner}>
                <div>
                  <strong>The source changed after this translation.</strong>
                  <p>Retranslate to bring the new wording across.</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<RefreshCw size={12} />}
                  onClick={onTranslate}
                >
                  Update
                </Button>
              </div>
            ) : null}

            {errored && translation.error ? (
              <div className={styles.errorBanner}>
                <AlertTriangle size={15} aria-hidden="true" />
                <div>
                  <strong>Translation stopped.</strong>
                  <p>{translation.error.message}</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<RefreshCw size={12} />}
                  onClick={onTranslate}
                >
                  Retry
                </Button>
              </div>
            ) : null}

            {streaming ? (
              <div className={styles.progressRow} role="status">
                <LoaderCircle size={12} className={styles.spin} aria-hidden="true" />
                <span>
                  Translating into {targetLabel}
                  <span className={styles.progressCount}>
                    {translatedCount} / {blockCount}
                  </span>
                </span>
                <button type="button" className={styles.cancel} onClick={onCancel}>
                  <Square size={8} aria-hidden="true" />
                  Stop
                </button>
              </div>
            ) : null}

            <div className={styles.pages} dir={direction}>
              {pages.map((page, pageIndex) => {
                const blocks = page.blocks.filter((block) => block.text.trim())
                if (blocks.length === 0) return null
                return (
                  <section key={page.id} className={styles.pageGroup}>
                    {pages.length > 1 ? (
                      <div className={styles.pageLabel}>
                        <span>Page {String(pageIndex + 1).padStart(2, '0')}</span>
                        <span className={styles.pageLine} />
                      </div>
                    ) : null}
                    {blocks.map((block) => (
                      <TranslationRow
                        key={block.id}
                        block={block}
                        translated={translation.blocks[block.id]}
                        translation={translation}
                        direction={direction}
                        onEdit={(text) => onEditTranslation(block.id, text)}
                      />
                    ))}
                  </section>
                )
              })}
            </div>

            <div className={styles.footer}>
              <span className={styles.footerMeta}>
                {done ? (
                  <>
                    <Check size={10} aria-hidden="true" />
                    {translation.meta?.cached ? 'From cache' : 'Complete'}
                    {translation.meta ? ` · ${(translation.meta.ms / 1000).toFixed(1)} s` : null}
                  </>
                ) : streaming ? (
                  'Streaming block by block'
                ) : (
                  'Partial translation'
                )}
              </span>
              {done ? (
                <button type="button" className={styles.retranslate} onClick={onTranslate}>
                  <RefreshCw size={10} aria-hidden="true" />
                  Retranslate
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>
    </section>
  )
}

function TranslationIntro({
  note,
  blockCount,
  ocrBusy,
  targetLabel,
  targetNative,
  onChangeTarget,
  onTranslate,
}: {
  note: NoteState
  blockCount: number
  ocrBusy: boolean
  targetLabel: string
  targetNative: string
  onChangeTarget: (code: string) => void
  onTranslate: () => void
}) {
  const source = useMemo(() => {
    const detected = note.pages
      .map((page) => page.detectedLanguage)
      .filter((language): language is NonNullable<typeof language> => Boolean(language))
    const first = detected[0]
    if (!first) return null
    return { name: first.name, mixed: new Set(detected.map((item) => item.code)).size > 1 }
  }, [note.pages])

  return (
    <div className={styles.intro}>
      <div className={styles.orb} aria-hidden="true">
        <span className={styles.orbRing} />
        <Languages size={26} strokeWidth={1.25} />
        <span className={styles.orbMark}>A</span>
        <span className={styles.orbMarkAlt}>文</span>
      </div>

      <div className={styles.introEyebrow}>Step 02 · Language</div>
      <h2 className={styles.introTitle}>
        Read it in
        <br />
        <em>another tongue.</em>
      </h2>
      <p className={styles.introCopy}>
        Scripta carries the whole page across — headings, lists, tables and equations stay
        exactly where the ink put them.
      </p>

      <div className={styles.languageRow}>
        <LanguageSelector
          value={note.targetLang}
          onChange={onChangeTarget}
          label="Translate into"
          align="left"
          disabled={ocrBusy}
          compact
        />
        <Button
          variant="accent"
          size="lg"
          icon={<Sparkles size={15} />}
          onClick={onTranslate}
          disabled={ocrBusy || blockCount === 0}
          title={ocrBusy ? 'Wait for the page to finish reading' : `Translate into ${targetLabel}`}
        >
          {ocrBusy ? 'Reading…' : `Translate`}
        </Button>
      </div>

      <div className={styles.introFootnote}>
        {ocrBusy ? (
          <span className={styles.footnoteBusy}>
            <LoaderCircle size={10} className={styles.spin} aria-hidden="true" />
            Reading the page first — translation unlocks in a moment.
          </span>
        ) : (
          <>
            <CornerDownRight size={11} aria-hidden="true" />
            <span>
              {blockCount} block{blockCount === 1 ? '' : 's'} ·{' '}
              {source ? `from ${source.name}${source.mixed ? ' (mixed)' : ''}` : 'auto-detected'} ·
              into <strong dir="auto">{targetNative}</strong>
            </span>
          </>
        )}
      </div>

      <div className={styles.promise}>
        <div className={styles.promiseRow}>
          <span>01</span>
          <p>Meaning, not word-for-word. Names, numbers, units and tone survive.</p>
        </div>
        <div className={styles.promiseRow}>
          <span>02</span>
          <p>Markdown, tables and raw LaTeX are passed through untouched.</p>
        </div>
        <div className={styles.promiseRow}>
          <span>03</span>
          <p>Every block stays editable, in the new language too.</p>
        </div>
      </div>

      <p className={styles.ledeNote}>
        <ArrowRight size={11} aria-hidden="true" />
        You can change the language at any time — nothing is permanent.
      </p>
    </div>
  )
}

function TranslationRow({
  block,
  translated,
  translation,
  direction,
  onEdit,
}: {
  block: Block
  translated: string | undefined
  translation: TranslationState
  direction: 'ltr' | 'rtl'
  onEdit: (text: string) => void
}) {
  const textareaRef = useAutoGrow(translated ?? '')
  const streaming = translation.status === 'streaming'
  const done = translation.status === 'done'

  return (
    <article
      className={clsx(
        styles.row,
        streaming && !translated && styles.rowPending,
        translation.stale && styles.rowStale,
      )}
      data-block-id={block.id}
    >
      <div className={styles.rowMeta}>
        <span className={styles.rowType}>{blockTypeLabel(block.type)}</span>
        {translated ? (
          <span className={styles.rowState}>
            <Check size={8} aria-hidden="true" />
            translated
          </span>
        ) : streaming ? (
          <span className={styles.rowStatePending}>
            <LoaderCircle size={8} className={styles.spin} aria-hidden="true" />
            translating
          </span>
        ) : (
          <span className={styles.rowStateMissing}>not translated</span>
        )}
      </div>

      {translated ? (
        <textarea
          ref={textareaRef}
          className={styles.translatedText}
          dir={direction}
          value={translated}
          readOnly={streaming}
          aria-label={`${blockTypeLabel(block.type)} translation`}
          spellCheck
          onChange={(event) => onEdit(event.target.value)}
        />
      ) : streaming ? (
        <div className={styles.pendingLines} aria-hidden="true">
          <span style={{ width: '92%' }} />
          <span style={{ width: done ? '70%' : '61%' }} />
        </div>
      ) : (
        <p className={styles.untranslated}>No translation for this block.</p>
      )}

      <details className={styles.source}>
        <summary>
          <span>Source</span>
          <span className={styles.sourceText} dir="auto">
            {block.text.replace(/\s+/g, ' ').slice(0, 110)}
          </span>
        </summary>
        <p dir="auto">{block.text}</p>
      </details>
    </article>
  )
}
