import { describe, expect, it } from 'vitest'
import { extractArrayObjects } from '../server/stream-json'

describe('extractArrayObjects', () => {
  it('returns complete objects even while the document is unfinished', () => {
    const json =
      '{"detectedLanguage":{"code":"en","name":"English"},"title":"Notes","blocks":[{"id":"a","text":"one"},{"id":"b","text":"two"}],"warnings":[]}'

    expect(extractArrayObjects(json, 'blocks')).toEqual([
      { id: 'a', text: 'one' },
      { id: 'b', text: 'two' },
    ])
  })

  it('waits for a partial object to finish before emitting it', () => {
    const partial =
      '{"blocks":[{"id":"a","text":"complete"},{"id":"b","text":"still gro'

    expect(extractArrayObjects(partial, 'blocks')).toEqual([{ id: 'a', text: 'complete' }])
  })

  it('handles braces, brackets and escaped quotes inside strings', () => {
    const json =
      '{"blocks":[{"id":"a","text":"a } brace, [ bracket \\"quote\\" and \\\\ slash"},{"id":"b","text":"two"}]}'

    expect(extractArrayObjects(json, 'blocks')).toEqual([
      { id: 'a', text: 'a } brace, [ bracket "quote" and \\ slash' },
      { id: 'b', text: 'two' },
    ])
  })

  it('uses the array at the requested key, not a nested array with the same name', () => {
    const json = '{"meta":{"blocks":[{"id":"nested"}]},"blocks":[{"id":"real"}]}'

    expect(extractArrayObjects(json, 'blocks')).toEqual([{ id: 'real' }])
  })

  it('returns an empty list when the key has not arrived', () => {
    expect(extractArrayObjects('{"detectedLanguage":', 'blocks')).toEqual([])
    expect(extractArrayObjects('', 'blocks')).toEqual([])
  })
})
