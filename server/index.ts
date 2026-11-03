import { createApp } from './app'
import { loadConfig, healthMode } from './config'
import { createLogger } from './logger'

const config = loadConfig()
const logger = createLogger(config.logLevel)
const app = createApp(config)
const mode = healthMode(config)

if (mode === 'unconfigured') {
  logger.warn('GEMINI_API_KEY is missing. OCR will return a setup error until it is added.')
} else if (mode === 'mock') {
  logger.warn('Demo mode active: OCR and translation are simulated. Set GEMINI_API_KEY for live scans.')
}

const server = app.listen(config.port, () => {
  logger.info(
    {
      port: config.port,
      mode,
      model: config.model,
      maxUploadMb: config.maxUploadMb,
    },
    'Scripta ready',
  )
})

function shutdown(signal: string): void {
  logger.info({ signal }, 'shutting down')
  server.close((error) => {
    if (error) {
      logger.error({ err: error }, 'shutdown failed')
      process.exit(1)
    }
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
