import { Suspense, lazy } from 'react'
import styles from './MarkdownView.module.css'

/**
 * The markdown renderer (react-markdown + KaTeX) is code-split so the handwriting
 * canvas and editing controls stay light; the preview loads on demand.
 */
export const MarkdownView = lazy(async () => {
  const { MarkdownContent } = await import('./MarkdownContent')
  return { default: MarkdownContent }
})

interface MarkdownViewProps {
  markdown: string
  className?: string | undefined
}

export function MarkdownPreview({ markdown, className }: MarkdownViewProps) {
  return (
    <Suspense fallback={<div className={styles.fallback}>Rendering markdown…</div>}>
      <MarkdownView markdown={markdown} className={className} />
    </Suspense>
  )
}
