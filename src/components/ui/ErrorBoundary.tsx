import { Component, type ErrorInfo, type ReactNode } from 'react'
import styles from './ErrorBoundary.module.css'

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Scripta crashed while rendering', error, info.componentStack)
  }

  override render() {
    if (!this.state.hasError) return this.props.children

    return (
      <main className={styles.fallback}>
        <div className={styles.card}>
          <div className={styles.kicker}>Scripta · interrupted</div>
          <h1>The desk lost its page.</h1>
          <p>
            Something went wrong while drawing the interface. Your local history is stored
            separately in this browser and is safe.
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={() => window.location.reload()}>
              Reload Scripta
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => {
                this.setState({ hasError: false })
              }}
            >
              Try rendering again
            </button>
          </div>
        </div>
      </main>
    )
  }
}
