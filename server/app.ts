import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import express, { type Request, type Response } from 'express'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import multer from 'multer'
import pinoHttp from 'pino-http'
import { apiError, translateRequestSchema, type OcrStreamEvent, type TranslateStreamEvent } from '../shared/contracts'
import type { ServerConfig } from './config'
import { healthMode, ocrModelLabel } from './config'
import { AppError, isAbortError, mapUpstreamError } from './errors'
import { processUploadedImage } from './image'
import { streamOcr, streamTranslation } from './gemini'
import { mockOcr, mockTranslation } from './mock'
import { createLogger } from './logger'

const PAGE_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/

function writeEvent(res: Response, event: OcrStreamEvent | TranslateStreamEvent): void {
  if (res.writableEnded) return
  res.write(`${JSON.stringify(event)}\n`)
}

function startNdjson(res: Response): void {
  res.status(200)
  res.set({
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, no-transform',
    'X-Accel-Buffering': 'no',
    Connection: 'keep-alive',
  })
  res.flushHeaders()
}

function uploadError(error: unknown): AppError {
  if (error instanceof AppError) return error
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return new AppError('TOO_LARGE', 'That image is too large. Use a photo under the upload limit.', 413, false)
    }
    return new AppError('INVALID_IMAGE', 'The upload could not be accepted.', 400, false)
  }
  return new AppError('INVALID_IMAGE', 'The upload could not be read.', 400, false)
}

export function createApp(config: ServerConfig) {
  const app = express()
  const logger = createLogger(config.logLevel)
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1, fields: 8 },
    fileFilter: (_req, file, callback) => {
      if (!file.mimetype.startsWith('image/')) {
        callback(new AppError('INVALID_IMAGE', 'Choose an image file (JPG, PNG, or WebP).', 400, false))
        return
      }
      callback(null, true)
    },
  })

  app.disable('x-powered-by')
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", 'data:'],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          objectSrc: ["'none'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  )
  app.use((req, res, next) => {
    req.headers['x-request-id'] = req.headers['x-request-id'] ?? randomUUID()
    res.setHeader('X-Request-Id', req.headers['x-request-id'])
    next()
  })
  app.use(pinoHttp({ logger, quietReqLogger: true }))
  app.use(express.json({ limit: '1mb' }))

  const aiLimiter = rateLimit({
    windowMs: 60_000,
    limit: config.rateLimitPerMin,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: apiError('RATE_LIMITED', 'Too many scans in a minute. Take a breath, then retry.', true),
      })
    },
  })

  app.get('/api/health', (_req, res) => {
    const mode = healthMode(config)
    res.json({
      ok: mode !== 'unconfigured',
      mode,
      model: ocrModelLabel(config),
      maxUploadMb: config.maxUploadMb,
      version: config.version,
    })
  })

  app.use(['/api/ocr', '/api/translate'], aiLimiter)

  app.post(
    '/api/ocr',
    (req, res, next) => {
      upload.single('image')(req, res, (error: unknown) => {
        if (error) {
          next(uploadError(error))
          return
        }
        next()
      })
    },
    async (req: Request, res: Response) => {
      const file = req.file
      const pageId = typeof req.body?.pageId === 'string' ? req.body.pageId : ''
      const hintLanguage =
        typeof req.body?.hintLanguage === 'string' ? req.body.hintLanguage.slice(0, 30) : undefined

      if (!file) {
        throw new AppError('INVALID_IMAGE', 'Add an image to scan.', 400, false)
      }
      if (!PAGE_ID_PATTERN.test(pageId)) {
        throw new AppError('INVALID_IMAGE', 'The page identifier was invalid.', 400, false)
      }

      const image = await processUploadedImage(file.buffer)
      const controller = new AbortController()
      res.on('close', () => {
        if (!res.writableEnded) controller.abort()
      })

      startNdjson(res)
      writeEvent(res, { type: 'start', pageId, model: ocrModelLabel(config) })

      try {
        const result = config.mock
          ? await mockOcr(
              { pageId, image: image.buffer, mimeType: image.mimeType, hintLanguage },
              {
                onBlock: (block, index) => writeEvent(res, { type: 'block', block, index }),
                onWarning: (message) => writeEvent(res, { type: 'warning', message }),
              },
              controller.signal,
              config.mockDelayMs,
            )
          : await streamOcr(
              config,
              { pageId, image: image.buffer, mimeType: image.mimeType, hintLanguage },
              {
                onBlock: (block, index) => writeEvent(res, { type: 'block', block, index }),
                onWarning: (message) => writeEvent(res, { type: 'warning', message }),
              },
              controller.signal,
            )

        writeEvent(res, { type: 'done', page: result.page, meta: result.meta })
        res.end()
      } catch (error) {
        if (isAbortError(error) || controller.signal.aborted) {
          res.end()
          return
        }
        const mapped = mapUpstreamError(error, Boolean(config.apiKey))
        logger.error({ err: mapped, pageId }, 'ocr stream failed')
        writeEvent(res, { type: 'error', error: mapped.toApiError() })
        res.end()
      }
    },
  )

  app.post('/api/translate', async (req: Request, res: Response) => {
    const parsed = translateRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      throw new AppError('BAD_MODEL_OUTPUT', 'That translation request was incomplete.', 400, false)
    }

    const controller = new AbortController()
    res.on('close', () => {
      if (!res.writableEnded) controller.abort()
    })

    startNdjson(res)
    writeEvent(res, {
      type: 'start',
      target: parsed.data.target,
      model: config.mock ? 'demo-translator' : config.model,
    })

    try {
      const result = config.mock
        ? await mockTranslation(
            parsed.data,
            {
              onBlock: (block, index) => writeEvent(res, { type: 'block', block, index }),
            },
            controller.signal,
            config.mockDelayMs,
          )
        : await streamTranslation(
            config,
            parsed.data,
            {
              onBlock: (block, index) => writeEvent(res, { type: 'block', block, index }),
            },
            controller.signal,
          )

      writeEvent(res, { type: 'done', blocks: result.blocks, meta: result.meta })
      res.end()
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) {
        res.end()
        return
      }
      const mapped = mapUpstreamError(error, Boolean(config.apiKey))
      logger.error({ err: mapped }, 'translation stream failed')
      writeEvent(res, { type: 'error', error: mapped.toApiError() })
      res.end()
    }
  })

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: apiError('NOT_FOUND', 'That API route does not exist.') })
  })

  const distPath = path.resolve(process.cwd(), 'dist')
  if (config.nodeEnv === 'production' && existsSync(distPath)) {
    app.use(
      express.static(distPath, {
        index: false,
        maxAge: '1h',
        setHeaders: (res, filePath) => {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
          }
        },
      }),
    )
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api/')) {
        res.sendFile(path.join(distPath, 'index.html'))
        return
      }
      next()
    })
  }

  app.use((_req, res) => {
    res.status(404).json({ error: apiError('NOT_FOUND', 'Not found.') })
  })

  app.use(
    (
      error: unknown,
      _req: Request,
      res: Response,
      _next: express.NextFunction,
    ) => {
      const mapped = error instanceof AppError ? error : mapUpstreamError(error, Boolean(config.apiKey))
      if (mapped.status >= 500) logger.error({ err: mapped }, 'request failed')
      if (res.headersSent) {
        res.end()
        return
      }
      res.status(mapped.status).json({ error: mapped.toApiError() })
    },
  )

  return app
}
