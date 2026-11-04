// @vitest-environment node
import { createServer, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import sharp from 'sharp'
import type { OcrStreamEvent, TranslateStreamEvent } from '../shared/contracts'
import { createApp } from '../server/app'
import { loadConfig } from '../server/config'

interface CapturedRequest {
  path: string
  authorization: string
  body: Record<string, unknown>
}

const servers: Server[] = []
const captured: CapturedRequest[] = []
let fakeBase = ''

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      resolve(`http://127.0.0.1:${port}`)
    })
  })
}

function sseLine(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`
}

function contentChunks(content: string): string {
  const pieces: string[] = []
  const size = 23
  for (let index = 0; index < content.length; index += size) {
    pieces.push(content.slice(index, index + size))
  }
  return pieces
    .map((piece) =>
      sseLine({
        id: 'gen-test',
        model: 'test/vision-model',
        choices: [{ index: 0, delta: { content: piece }, finish_reason: null }],
      }),
    )
    .join('')
}

function completeStream(content: string): string {
  return [
    ': OPENROUTER PROCESSING\n\n',
    contentChunks(content),
    sseLine({
      id: 'gen-test',
      model: 'test/vision-model',
      choices: [{ index: 0, delta: { content: '' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 123, completion_tokens: 45 },
    }),
    'data: [DONE]\n\n',
  ].join('')
}

function writeSse(response: ServerResponse, content: string): void {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  response.end(completeStream(content))
}

beforeAll(async () => {
  const fake = createServer((request, response) => {
    let raw = ''
    request.on('data', (chunk: Buffer) => {
      raw += chunk.toString()
    })
    request.on('end', () => {
      let body: Record<string, unknown> = {}
      try {
        body = JSON.parse(raw) as Record<string, unknown>
      } catch {
        body = {}
      }
      captured.push({
        path: request.url ?? '',
        authorization: request.headers.authorization ?? '',
        body,
      })

      if (request.headers.authorization !== 'Bearer test-key') {
        response.writeHead(401, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ error: { code: 401, message: 'No auth credentials found' } }))
        return
      }

      const serialized = JSON.stringify(body.messages ?? '')
      if (serialized.includes('translation engine')) {
        writeSse(
          response,
          JSON.stringify({
            blocks: [
              { id: 'p1-b0', text: 'Hola' },
              { id: 'p1-b1', text: 'Mundo' },
            ],
          }),
        )
        return
      }

      writeSse(
        response,
        JSON.stringify({
          detectedLanguage: { code: 'en', name: 'English', confidence: 0.98 },
          title: 'Test Page',
          blocks: [
            { type: 'heading', text: 'Hello', bbox: [20, 20, 80, 400], confidence: 0.95 },
            { type: 'paragraph', text: 'World', bbox: [100, 20, 180, 500], confidence: 0.88 },
          ],
          warnings: [],
        }),
      )
    })
  })
  servers.push(fake)
  fakeBase = await listen(fake)
})

afterAll(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve())
        }),
    ),
  )
})

function liveConfig(key = 'test-key') {
  return loadConfig({
    NODE_ENV: 'test',
    AI_PROVIDER: 'openrouter',
    OPENROUTER_API_KEY: key,
    OPENROUTER_MODEL: 'test/vision-model',
    OPENROUTER_BASE_URL: `${fakeBase}/api/v1`,
    MOCK_GEMINI: '0',
    RATE_LIMIT_PER_MIN: '200',
    LOG_LEVEL: 'silent',
  } as NodeJS.ProcessEnv)
}

async function start(config: ReturnType<typeof loadConfig>): Promise<string> {
  const server = createApp(config).listen(0, '127.0.0.1')
  servers.push(server)
  await new Promise<void>((resolve) => server.once('listening', () => resolve()))
  const { port } = server.address() as AddressInfo
  return `http://127.0.0.1:${port}`
}

async function makeImage(): Promise<Buffer> {
  return sharp({
    create: { width: 240, height: 320, channels: 3, background: '#faf7f0' },
  })
    .jpeg()
    .toBuffer()
}

function parseLines<T>(text: string): T[] {
  return text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T)
}

describe('OpenRouter provider', () => {
  it('auto-selects OpenRouter when its key is present and reports live health', async () => {
    const auto = loadConfig({
      NODE_ENV: 'production',
      OPENROUTER_API_KEY: 'or-key',
      GEMINI_API_KEY: 'gemini-key',
    } as NodeJS.ProcessEnv)
    expect(auto.provider).toBe('openrouter')
    expect(auto.model).toBe('nvidia/nemotron-3.5-super-vl:free')

    const base = await start(liveConfig())
    const health = (await (await fetch(`${base}/api/health`)).json()) as {
      mode: string
      provider: string
      model: string
    }
    expect(health).toMatchObject({
      mode: 'live',
      provider: 'openrouter',
      model: 'test/vision-model',
    })
  })

  it('sends an image with a strict JSON schema and streams OCR blocks', async () => {
    captured.length = 0
    const base = await start(liveConfig())
    const form = new FormData()
    form.append('pageId', 'p1')
    const image = await makeImage()
    form.append(
      'image',
      new Blob(
        [image.buffer.slice(image.byteOffset, image.byteOffset + image.byteLength) as ArrayBuffer],
        {
          type: 'image/jpeg',
        },
      ),
      'page.jpg',
    )

    const response = await fetch(`${base}/api/ocr`, { method: 'POST', body: form })
    expect(response.status).toBe(200)
    const events = parseLines<OcrStreamEvent>(await response.text())

    expect(events[0]).toMatchObject({
      type: 'start',
      pageId: 'p1',
      model: 'test/vision-model',
    })
    expect(events.filter((event) => event.type === 'block')).toHaveLength(2)

    const done = events.find((event) => event.type === 'done')
    expect(done?.type === 'done' ? done.page.title : '').toBe('Test Page')
    expect(done?.type === 'done' ? done.page.blocks[0]?.text : '').toBe('Hello')
    expect(done?.type === 'done' ? done.meta : {}).toMatchObject({
      model: 'test/vision-model',
      inputTokens: 123,
      outputTokens: 45,
      truncated: false,
    })

    const request = captured[0]
    expect(request?.path).toBe('/api/v1/chat/completions')
    expect(request?.authorization).toBe('Bearer test-key')
    expect(request?.body).toMatchObject({
      model: 'test/vision-model',
      stream: true,
      provider: { require_parameters: true },
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'scripta_ocr',
          strict: true,
          schema: { type: 'object' },
        },
      },
    })

    const messages = request?.body.messages as
      { content: { type: string; image_url?: { url: string } }[] }[] | undefined
    const imagePart = messages?.[0]?.content.find((part) => part.type === 'image_url')
    expect(imagePart?.image_url?.url.startsWith('data:image/jpeg;base64,')).toBe(true)
  })

  it('streams translations through the same chat-completions adapter', async () => {
    captured.length = 0
    const base = await start(liveConfig())
    const response = await fetch(`${base}/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'en',
        target: 'es',
        blocks: [
          { id: 'p1-b0', text: 'Hello' },
          { id: 'p1-b1', text: 'World' },
        ],
      }),
    })

    expect(response.status).toBe(200)
    const events = parseLines<TranslateStreamEvent>(await response.text())
    const done = events.find((event) => event.type === 'done')
    expect(done?.type === 'done' ? done.blocks : []).toEqual([
      { id: 'p1-b0', text: 'Hola' },
      { id: 'p1-b1', text: 'Mundo' },
    ])
    expect(captured[0]?.body).toMatchObject({
      response_format: { json_schema: { name: 'scripta_translation', strict: true } },
    })
  })

  it('maps a rejected OpenRouter key to MISSING_KEY', async () => {
    const base = await start(liveConfig('wrong-key'))
    const form = new FormData()
    form.append('pageId', 'p1')
    const image = await makeImage()
    form.append(
      'image',
      new Blob(
        [image.buffer.slice(image.byteOffset, image.byteOffset + image.byteLength) as ArrayBuffer],
        {
          type: 'image/jpeg',
        },
      ),
      'page.jpg',
    )

    const response = await fetch(`${base}/api/ocr`, { method: 'POST', body: form })
    const events = parseLines<OcrStreamEvent>(await response.text())
    const error = events.find((event) => event.type === 'error')
    expect(error?.type === 'error' ? error.error.code : '').toBe('MISSING_KEY')
    expect(error?.type === 'error' ? error.error.message : '').toContain('OPENROUTER_API_KEY')
  })
})
