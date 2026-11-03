/**
 * Streaming JSON is not valid JSON until the final brace arrives. Gemini emits
 * structured output incrementally, so we pull out array elements as soon as
 * each complete object appears. This is deliberately small and dependency-free.
 */
export function extractArrayObjects(json: string, key: string): unknown[] {
  const start = findArrayStart(json, key)
  if (start === -1) return []

  const objects: unknown[] = []
  let index = start + 1

  while (index < json.length) {
    while (index < json.length && /[\s,]/.test(json[index] ?? '')) index += 1
    if (json[index] !== '{') break

    const end = findObjectEnd(json, index)
    if (end === -1) break

    const candidate = json.slice(index, end + 1)
    try {
      objects.push(JSON.parse(candidate))
    } catch {
      break
    }
    index = end + 1
  }

  return objects
}

function findArrayStart(json: string, key: string): number {
  let depth = 0
  let index = 0

  while (index < json.length) {
    const char = json[index]

    if (char === '"') {
      const stringEnd = findStringEnd(json, index)
      if (stringEnd === -1) return -1
      const value = json.slice(index + 1, stringEnd)
      if (depth === 1 && value === key) {
        let cursor = stringEnd + 1
        while (cursor < json.length && /\s/.test(json[cursor] ?? '')) cursor += 1
        if (json[cursor] === ':') {
          cursor += 1
          while (cursor < json.length && /\s/.test(json[cursor] ?? '')) cursor += 1
          if (json[cursor] === '[') return cursor
        }
      }
      index = stringEnd + 1
      continue
    }

    if (char === '{' || char === '[') depth += 1
    if (char === '}' || char === ']') depth -= 1
    index += 1
  }

  return -1
}

function findStringEnd(json: string, start: number): number {
  let escaped = false
  for (let index = start + 1; index < json.length; index += 1) {
    const char = json[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char === '"') return index
  }
  return -1
}

function findObjectEnd(json: string, start: number): number {
  let depth = 0
  let inString = false
  let escaped = false

  for (let index = start; index < json.length; index += 1) {
    const char = json[index]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) return index
    }
    if (char === ']' && depth === 0) return -1
  }

  return -1
}
