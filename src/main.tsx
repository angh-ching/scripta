import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/inter/wght-italic.css'
import '@fontsource-variable/newsreader'
import '@fontsource-variable/newsreader/wght-italic.css'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource-variable/caveat'
import './styles/tokens.css'
import './styles/global.css'
import App from './App'
import { ErrorBoundary } from './components/ui/ErrorBoundary'

const container = document.getElementById('root')
if (!container) throw new Error('Scripta could not find its root element.')

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
