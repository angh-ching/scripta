import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import clsx from 'clsx'
import { getLanguage, searchLanguages, SUGGESTED_LANGUAGES, type Language } from '../../../shared/languages'
import styles from './LanguageSelector.module.css'

interface LanguageSelectorProps {
  value: string
  onChange: (code: string) => void
  label?: string
  align?: 'left' | 'right'
  disabled?: boolean
  allowAuto?: boolean
  detectedCode?: string
  compact?: boolean
  ariaLabel?: string
}

export function LanguageSelector({
  value,
  onChange,
  label = 'Translate to',
  align = 'right',
  disabled = false,
  allowAuto = false,
  detectedCode,
  compact = false,
  ariaLabel,
}: LanguageSelectorProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listboxId = useId()
  const optionId = useId()

  const selected = value === 'auto' ? null : getLanguage(value)
  const displayName = value === 'auto' ? 'Auto-detect' : (selected?.name ?? value)
  const displayNative = value === 'auto' ? 'Source language' : (selected?.nativeName ?? '')

  const results = useMemo<Language[]>(() => {
    const matches = searchLanguages(query)
    if (query.trim()) return matches
    const suggested = SUGGESTED_LANGUAGES.map((code) => getLanguage(code)).filter(
      (language): language is Language => Boolean(language),
    )
    const suggestedCodes = new Set(suggested.map((language) => language.code))
    return [...suggested, ...matches.filter((language) => !suggestedCodes.has(language.code))]
  }, [query])

  const options = useMemo(
    () =>
      allowAuto
        ? [
            { code: 'auto', name: 'Auto-detect', nativeName: 'Source language', rtl: false },
            ...results,
          ]
        : results,
    [allowAuto, results],
  )

  useEffect(() => {
    if (!open) return
    setQuery('')
    const index = options.findIndex((option) => option.code === value)
    setActiveIndex(Math.max(0, index))
    const timer = window.setTimeout(() => searchRef.current?.focus(), 20)

    const handlePointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointer)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('pointerdown', handlePointer)
    }
    // The option list is derived from value at open time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const active = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
    active?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open])

  const choose = (code: string) => {
    onChange(code)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % Math.max(options.length, 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => (index - 1 + options.length) % Math.max(options.length, 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const option = options[activeIndex]
      if (option) choose(option.code)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
    } else if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div className={styles.container} ref={containerRef}>
      {label ? <span className={styles.fieldLabel}>{label}</span> : null}
      <button
        ref={triggerRef}
        type="button"
        className={clsx(styles.trigger, compact && styles.triggerCompact, open && styles.triggerOpen)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={`${ariaLabel ?? label}: ${displayName}`}
        disabled={disabled}
        onClick={() => setOpen((valueState) => !valueState)}
      >
        <span className={styles.triggerText}>
          <span className={styles.triggerName}>{displayName}</span>
          {!compact && displayNative && displayNative !== displayName ? (
            <span className={styles.triggerNative}>{displayNative}</span>
          ) : null}
        </span>
        <ChevronDown size={14} className={clsx(styles.chevron, open && styles.chevronOpen)} aria-hidden="true" />
      </button>

      {open ? (
        <div className={clsx(styles.popover, align === 'right' ? styles.right : styles.left)}>
          <div className={styles.searchRow}>
            <Search size={14} aria-hidden="true" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              role="combobox"
              aria-expanded={open}
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={
                options[activeIndex] ? `${optionId}-${options[activeIndex].code}` : undefined
              }
              aria-label="Search languages"
              placeholder="Search 40+ languages…"
              onChange={(event) => {
                setQuery(event.target.value)
                setActiveIndex(0)
              }}
              onKeyDown={handleKeyDown}
            />
          </div>

          {!query.trim() ? (
            <div className={styles.suggested}>
              <span className={styles.suggestedLabel}>Quick picks</span>
              <div className={styles.chips}>
                {SUGGESTED_LANGUAGES.slice(0, 6).map((code) => {
                  const language = getLanguage(code)
                  if (!language) return null
                  return (
                    <button
                      key={code}
                      type="button"
                      className={styles.chip}
                      onClick={() => choose(code)}
                    >
                      {language.name}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label="Languages"
            className={styles.list}
          >
            {options.length === 0 ? (
              <li className={styles.empty}>No language matches “{query}”.</li>
            ) : (
              options.map((language, index) => {
                const isSelected = language.code === value
                const isDetected = detectedCode === language.code
                return (
                  <li key={language.code} role="presentation">
                    <button
                      type="button"
                      id={`${optionId}-${language.code}`}
                      role="option"
                      aria-selected={isSelected}
                      data-index={index}
                      tabIndex={-1}
                      className={clsx(
                        styles.option,
                        index === activeIndex && styles.optionActive,
                        isSelected && styles.optionSelected,
                      )}
                      onMouseEnter={() => setActiveIndex(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => choose(language.code)}
                    >
                      <span className={styles.optionText} dir={language.rtl ? 'rtl' : 'ltr'}>
                        <span className={styles.optionName}>{language.name}</span>
                        <span className={styles.optionNative}>{language.nativeName}</span>
                      </span>
                      <span className={styles.optionMeta}>
                        {isDetected ? <span className={styles.detected}>detected</span> : null}
                        {language.rtl ? <span className={styles.rtl}>RTL</span> : null}
                        <span className={styles.code}>{language.code}</span>
                        {isSelected ? <Check size={13} aria-hidden="true" /> : null}
                      </span>
                    </button>
                  </li>
                )
              })
            )}
          </ul>
          <div className={styles.footer}>
            <span>{options.length} languages</span>
            <span>↑↓ move · ↵ choose · esc close</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
