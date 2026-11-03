import { useCallback, useEffect, useState } from 'react'
import type { Health } from '../../shared/contracts'
import { fetchHealth, isAbortError } from './api'

export function useHealth() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setError(null)
    void fetchHealth(controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setHealth(next)
      })
      .catch((nextError: unknown) => {
        if (isAbortError(nextError) || controller.signal.aborted) return
        setError(nextError instanceof Error ? nextError.message : 'Reading service unavailable.')
      })
    return () => controller.abort()
  }, [attempt])

  const retry = useCallback(() => setAttempt((value) => value + 1), [])

  return { health, error, retry }
}
