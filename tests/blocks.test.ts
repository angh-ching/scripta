import { describe, expect, it } from 'vitest'
import {
  bboxStyle,
  blocksToMarkdown,
  blocksToPlainText,
  blockToMarkdown,
  countWords,
  titleFromBlocks,
} from '../shared/blocks'
import type { Block } from '../shared/contracts'

function block(overrides: Partial<Block> & Pick<Block, 'text'>): Block {
  return {
    id: overrides.id ?? 'b1',
    type: overrides.type ?? 'paragraph',
    text: overrides.text,
    bbox: overrides.bbox ?? null,
    confidence: overrides.confidence ?? 0.9,
  }
}

describe('blockToMarkdown', () => {
  it('adds a second-level heading without duplicating hashes', () => {
    expect(blockToMarkdown(block({ type: 'heading', text: '## Field notes' }))).toBe(
      '## Field notes',
    )
  })

  it('turns unmarked list lines into bullets but leaves marked lines alone', () => {
    expect(blockToMarkdown(block({ type: 'list', text: 'one\ntwo' }))).toBe('- one\n- two')
    expect(blockToMarkdown(block({ type: 'list', text: '- one\n2. two' }))).toBe('- one\n2. two')
  })

  it('wraps equations in display math exactly once', () => {
    expect(blockToMarkdown(block({ type: 'equation', text: 'x^2 + y^2' }))).toBe(
      '$$\nx^2 + y^2\n$$',
    )
    expect(blockToMarkdown(block({ type: 'equation', text: '$$x^2$$' }))).toBe('$$x^2$$')
  })

  it('preserves GFM tables verbatim', () => {
    const table = '| Time | Height |\n| --- | --- |\n| 06:00 | 2.1 m |'
    expect(blockToMarkdown(block({ type: 'table', text: table }))).toBe(table)
  })
})

describe('document helpers', () => {
  const blocks = [
    block({ id: 'h', type: 'heading', text: '# North Jetty', confidence: 0.98 }),
    block({ id: 'p', type: 'paragraph', text: 'Tide came in early.' }),
    block({ id: 'l', type: 'list', text: 'Check salinity\nPhotograph markers' }),
  ]

  it('joins blocks with a blank line', () => {
    expect(blocksToMarkdown(blocks)).toContain('## North Jetty\n\nTide came in early.')
  })

  it('strips markdown for plain text', () => {
    const plain = blocksToPlainText(blocks)
    expect(plain).toContain('North Jetty')
    expect(plain).toContain('• Check salinity')
    expect(plain).not.toContain('##')
  })

  it('counts CJK characters as words when whitespace is absent', () => {
    expect(countWords('今天我去海边')).toBe(6)
    expect(countWords('')).toBe(0)
    expect(countWords('two words')).toBe(2)
  })

  it('prefers the first heading for the document title', () => {
    expect(titleFromBlocks(blocks)).toBe('North Jetty')
    expect(titleFromBlocks([])).toBe('Untitled scan')
  })
})

describe('bboxStyle', () => {
  it('maps normalized coordinates to percentages', () => {
    expect(bboxStyle([100, 200, 500, 800])).toEqual({
      top: '10%',
      left: '20%',
      width: '60%',
      height: '40%',
    })
  })

  it('never returns an invisible box', () => {
    const style = bboxStyle([100, 100, 101, 101])
    expect(style.width).toBe('0.5%')
    expect(style.height).toBe('0.5%')
  })
})
