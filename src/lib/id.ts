export function newId(prefix = ''): string {
  const raw =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  const compact = raw.replace(/-/g, '').slice(0, 20)
  return `${prefix}${compact}`
}

export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const diffSeconds = Math.round((timestamp - now) / 1000)
  const abs = Math.abs(diffSeconds)
  if (abs < 45) return 'just now'
  if (abs < 3600) {
    const minutes = Math.round(abs / 60)
    return `${minutes} min ${diffSeconds < 0 ? 'ago' : 'from now'}`
  }
  if (abs < 86_400) {
    const hours = Math.round(abs / 3600)
    return `${hours} hr ${diffSeconds < 0 ? 'ago' : 'from now'}`
  }
  if (abs < 604_800) {
    const days = Math.round(abs / 86_400)
    return `${days} day${days === 1 ? '' : 's'} ${diffSeconds < 0 ? 'ago' : 'from now'}`
  }
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: timestamp < now - 31_536_000_000 ? 'numeric' : undefined,
  }).format(timestamp)
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}
