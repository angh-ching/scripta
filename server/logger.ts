import pino from 'pino'

export function createLogger(level: string) {
  return pino({
    level,
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', '*.apiKey', '*.GEMINI_API_KEY'],
      censor: '[redacted]',
    },
  })
}
