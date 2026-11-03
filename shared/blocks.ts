import type { Block, BlockType } from './contracts'

export const LOW_CONFIDENCE_THRESHOLD = 0.72

export function isLowConfidence(block: Block, threshold = LOW_CONFIDENCE_THRESHOLD): boolean {
  return block.confidence < threshold
}

export function blockTypeLabel(type: BlockType): string {
  switch (type) {
    case 'heading':
      return 'Heading'
    case 'paragraph':
      return 'Paragraph'
    case 'list':
      return 'List'
    case 'equation':
      return 'Equation'
    case 'table':
      return 'Table'
    case 'code':
      return 'Code'
    case 'other':
      return 'Text'
  }
}

export function blockToMarkdown(block: Block): string {
  const text = block.text.trim()
  switch (block.type) {
    case 'heading':
      return `## ${text.replace(/^#+\s*/, '')}`
    case 'list': {
      const lines = text.split('\n').filter((line) => line.trim().length > 0)
      const alreadyMarked = lines.every((line) => /^\s*(?:[-*+]|\d+[.)])\s+/.test(line))
      return alreadyMarked ? lines.join('\n') : lines.map((line) => `- ${line}`).join('\n')
    }
    case 'equation':
      return text.startsWith('$$') ? text : `$$\n${text}\n$$`
    case 'table':
      return text
    case 'code':
      return text.startsWith('```') ? text : `\`\`\`\n${text}\n\`\`\``
    case 'paragraph':
    case 'other':
      return text
  }
}

export function blocksToMarkdown(blocks: Block[]): string {
  return blocks.map(blockToMarkdown).join('\n\n')
}

export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, (match) => match.replace(/```[a-z]*\n?/g, '').replace(/```/g, ''))
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/^\s*(\d+)[.)]\s+/gm, '$1. ')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\$\$?([\s\S]*?)\$\$?/g, '$1')
    .replace(/\|/g, ' ')
    .replace(/^\s*---+\s*$/gm, '')
    .trim()
}

export function blocksToPlainText(blocks: Block[]): string {
  return markdownToPlainText(blocksToMarkdown(blocks))
}

export function countWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  const spaced = trimmed.split(/\s+/).filter(Boolean).length
  const cjkCharacters = trimmed.match(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g)?.length ?? 0
  return Math.max(spaced, cjkCharacters)
}

export function countDocumentWords(blocks: Block[]): number {
  return countWords(blocksToPlainText(blocks))
}

export function titleFromBlocks(blocks: Block[], fallback = 'Untitled scan'): string {
  const heading = blocks.find((block) => block.type === 'heading' && block.text.trim())
  if (heading) return heading.text.trim().replace(/^#+\s*/, '').slice(0, 90)
  const first = blocks.find((block) => block.text.trim())
  if (!first) return fallback
  return first.text.trim().split('\n')[0]?.slice(0, 90) ?? fallback
}

export function bboxStyle(bbox: [number, number, number, number]): {
  top: string
  left: string
  width: string
  height: string
} {
  const [ymin, xmin, ymax, xmax] = bbox
  return {
    top: `${ymin / 10}%`,
    left: `${xmin / 10}%`,
    width: `${Math.max(0.5, (xmax - xmin) / 10)}%`,
    height: `${Math.max(0.5, (ymax - ymin) / 10)}%`,
  }
}
