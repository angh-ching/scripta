import { memo, useMemo } from 'react'
import katex from 'katex'
import styles from './BlockEditor.module.css'

export const MathView = memo(function MathView({ text }: { text: string }) {
  const math = useMemo(() => {
    try {
      return katex.renderToString(text, {
        throwOnError: false,
        displayMode: true,
        strict: 'ignore',
      })
    } catch {
      return ''
    }
  }, [text])

  if (!text) return null

  return <div className={styles.math} dir="ltr" dangerouslySetInnerHTML={{ __html: math }} title={text} />
})
