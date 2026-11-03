import type { Block } from '../../shared/contracts'
import { blocksToMarkdown, blockToMarkdown } from '../../shared/blocks'
import { directionForLanguage, getLanguage, languageName } from '../../shared/languages'
import type { NoteState } from '../features/workspace/types'

function documentTitle(note: NoteState): string {
  return note.title.trim() || note.pages[0]?.name.replace(/\.[^.]+$/, '') || 'Scripta note'
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 70) || 'scripta-note'
  )
}

function pageMarkdown(note: NoteState): string {
  return note.pages
    .map((page) => blocksToMarkdown(page.blocks))
    .filter((content) => content.trim())
    .join('\n\n---\n\n')
}

function duplicateTitleHeading(note: NoteState): boolean {
  const first = note.pages[0]?.blocks[0]
  return Boolean(
    first &&
      first.type === 'heading' &&
      first.text.trim().toLowerCase() === note.title.trim().toLowerCase(),
  )
}

export function transcriptMarkdown(note: NoteState): string {
  const parts: string[] = []
  if (note.title.trim() && !duplicateTitleHeading(note)) parts.push(`# ${note.title.trim()}`)
  const content = pageMarkdown(note)
  if (content) parts.push(content)
  return `${parts.join('\n\n').trim()}\n`
}

export function translationMarkdown(note: NoteState): string {
  const translation = note.translation
  if (!translation || translation.status === 'streaming') return ''
  const blocks: Block[] = []
  for (const page of note.pages) {
    for (const block of page.blocks) {
      const text = translation.blocks[block.id]
      if (text) blocks.push({ ...block, text })
    }
  }
  return blocks.map(blockToMarkdown).join('\n\n')
}

export function combinedMarkdown(note: NoteState): string {
  const title = documentTitle(note)
  const transcript = transcriptMarkdown(note).trim()
  const translation = translationMarkdown(note)
  const pieces = [`# ${title}`, transcript]
  if (translation) {
    pieces.push(`---\n\n## Translation — ${languageName(note.targetLang)}`, translation)
  }
  return `${pieces.filter(Boolean).join('\n\n')}\n`
}

export function exportJson(note: NoteState): string {
  return JSON.stringify(
    {
      app: 'Scripta',
      version: 1,
      exportedAt: new Date().toISOString(),
      title: documentTitle(note),
      createdAt: new Date(note.createdAt).toISOString(),
      targetLanguage: note.targetLang,
      pages: note.pages.map((page) => ({
        id: page.id,
        name: page.name,
        width: page.width,
        height: page.height,
        detectedLanguage: page.detectedLanguage,
        warnings: page.warnings,
        meta: page.meta,
        blocks: page.blocks.map((block) => ({
          id: block.id,
          type: block.type,
          text: block.text,
          bbox: block.bbox,
          confidence: block.confidence,
        })),
      })),
      translation: note.translation,
    },
    null,
    2,
  )
}

export function downloadText(filename: string, content: string, mimeType = 'text/plain'): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadMarkdown(note: NoteState): void {
  downloadText(`${slugify(documentTitle(note))}.md`, combinedMarkdown(note), 'text/markdown')
}

export function downloadPlainText(note: NoteState): void {
  downloadText(
    `${slugify(documentTitle(note))}.txt`,
    `${documentTitle(note)}\n\n${transcriptMarkdown(note)}`,
    'text/plain',
  )
}

export function downloadJson(note: NoteState): void {
  downloadText(`${slugify(documentTitle(note))}.json`, exportJson(note), 'application/json')
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      const copied = document.execCommand('copy')
      textarea.remove()
      return copied
    } catch {
      return false
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function blockHtml(block: Block, text: string): string {
  const safe = escapeHtml(text).replace(/\n/g, '<br />')
  switch (block.type) {
    case 'heading':
      return `<h2>${safe}</h2>`
    case 'equation':
      return `<div class="equation">${safe}</div>`
    case 'table':
    case 'list':
    case 'code':
      return `<pre>${safe}</pre>`
    default:
      return `<p>${safe}</p>`
  }
}

function printSection(note: NoteState, translated: boolean): string {
  return note.pages
    .map((page) => {
      const blocks = page.blocks
        .map((block) => {
          if (!translated) return blockHtml(block, block.text)
          const text = note.translation?.blocks[block.id]
          return text ? blockHtml(block, text) : ''
        })
        .join('\n')
      return blocks ? `<section>${blocks}</section>` : ''
    })
    .filter(Boolean)
    .join('<hr class="page-break" />')
}

export function printNote(note: NoteState): boolean {
  const targetLanguage = getLanguage(note.targetLang)
  const hasTranslation = Boolean(translationMarkdown(note))
  const generated = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date())
  const html = `<!doctype html>
<html lang="${targetLanguage?.code ?? 'en'}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(documentTitle(note))}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 48px 56px; color: #1b1814; background: #fff; font-family: "Helvetica Neue", Arial, sans-serif; line-height: 1.55; }
  header { border-bottom: 1.5px solid #1b1814; padding-bottom: 14px; margin-bottom: 30px; }
  .kicker { font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #6b6255; }
  h1 { margin: 6px 0 8px; font-family: Georgia, "Times New Roman", serif; font-size: 32px; font-weight: 500; line-height: 1.1; }
  .meta { font-size: 11px; color: #6b6255; }
  section { margin-bottom: 34px; }
  h2 { font-family: Georgia, "Times New Roman", serif; font-size: 22px; font-weight: 500; margin: 24px 0 8px; }
  h3 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.12em; color: #6b6255; margin: 32px 0 10px; }
  p { margin: 0 0 12px; font-size: 14px; white-space: normal; }
  pre { margin: 0 0 14px; font-family: "SFMono-Regular", Consolas, monospace; font-size: 12px; white-space: pre-wrap; border-left: 2px solid #d8d0c1; padding-left: 12px; }
  .equation { font-family: Georgia, serif; font-style: italic; font-size: 16px; margin: 12px 0 18px; }
  hr.page-break { border: 0; border-top: 1px solid #e3ddd2; margin: 30px 0; }
  .translation { margin-top: 46px; padding-top: 28px; border-top: 2px solid #d6472b; }
  .translation h1 { color: #d6472b; }
  [dir="rtl"] { text-align: right; }
  @media print { body { padding: 18mm; } .page-break { break-after: page; } }
</style>
</head>
<body>
<header>
  <div class="kicker">Scripta · handwriting, digitized</div>
  <h1>${escapeHtml(documentTitle(note))}</h1>
  <div class="meta">${escapeHtml(generated)} · ${note.pages.length} page${note.pages.length === 1 ? '' : 's'}${hasTranslation ? ` · ${escapeHtml(languageName(note.targetLang))} translation` : ''}</div>
</header>
<section>${printSection(note, false)}</section>
${
  hasTranslation
    ? `<section class="translation" dir="${directionForLanguage(note.targetLang)}"><h3>${escapeHtml(languageName(note.targetLang))}</h3>${printSection(note, true)}</section>`
    : ''
}
</body>
</html>`

  const printWindow = window.open('', '_blank')
  if (!printWindow) return false
  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
  window.setTimeout(() => {
    printWindow.focus()
    printWindow.print()
  }, 300)
  return true
}
