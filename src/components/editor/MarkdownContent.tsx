import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import clsx from 'clsx'
import styles from './MarkdownView.module.css'

export function MarkdownContent({
  markdown,
  className,
}: {
  markdown: string
  className?: string | undefined
}) {
  return (
    <div className={clsx(styles.markdown, className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}

export function markdownForBlock(
  type: 'heading' | 'paragraph' | 'list' | 'equation' | 'table' | 'code' | 'other',
  text: string,
): string {
  switch (type) {
    case 'heading':
      return `## ${text.replace(/^#+\s*/, '')}`
    case 'list': {
      const lines = text.split('\n').filter((line) => line.trim())
      if (lines.every((line) => /^\s*(?:[-*+]|\d+[.)])\s+/.test(line))) return lines.join('\n')
      return lines.map((line) => `- ${line}`).join('\n')
    }
    case 'equation':
      return text.trim().startsWith('$$') ? text : `$$\n${text}\n$$`
    case 'table':
    case 'code':
    case 'paragraph':
    case 'other':
      return text
  }
}
