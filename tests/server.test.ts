// @vitest-environment node
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { createApp } from '../server/app'
import { loadConfig } from '../server/config'
import type { OcrStreamEvent, TranslateStreamEvent } from '../shared/contracts'
import { SAMPLE_NOTE_BLOCKS } from '../shared/sample'

const servers: Server[] = []

async function start(app: ReturnType<typeof createApp>): Promise<string> {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      servers.push(server)
      resolve(`http://127.0.0.1:${port}`)
    })
  })
}

function mockConfig() {
  return loadConfig({
    NODE_ENV: 'test',
    MOCK_GEMINI: '1',
    MOCK_DELAY_MS: '0',
    RATE_LIMIT_PER_MIN: '200',
    LOG_LEVEL: 'silent',
  } as NodeJS.ProcessEnv)
}

async function makeImage(): Promise<Buffer> {
  return sharp({
    create: { width: 320, height: 420, channels: 3, background: '#faf7f0' },
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

function ocrForm(pageId: string, image: Buffer): FormData {
  const form = new FormData()
  form.append('pageId', pageId)
  const bytes = image.buffer.slice(image.byteOffset, image.byteOffset + image.byteLength) as ArrayBuffer
  form.append('image', new Blob([bytes], { type: 'image/jpeg' }), 'page.jpg')
  return form
}

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

describe('Scripta API', () => {
  it('reports demo health and upload limits', async () => {
    const base = await start(createApp(mockConfig()))
    const response = await fetch(`${base}/api/health`)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      ok: true,
      mode: 'mock',
      model: 'demo-reader',
      maxUploadMb: 12,
    })
  })

  it('streams OCR blocks and a final page over NDJSON', async () => {
    const base = await start(createApp(mockConfig()))
    const image = await makeImage()
    const response = await fetch(`${base}/api/ocr`, {
      method: 'POST',
      body: ocrForm('p1', image),
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/x-ndjson')

    const events = parseLines<OcrStreamEvent>(await response.text())
    expect(events[0]).toMatchObject({ type: 'start', pageId: 'p1' })
    expect(events.filter((event) => event.type === 'block')).toHaveLength(
      SAMPLE_NOTE_BLOCKS.length,
    )

    const done = events.find((event) => event.type === 'done')
    expect(done).toBeDefined()
    if (done?.type === 'done') {
      expect(done.page.pageId).toBe('p1')
      expect(done.page.detectedLanguage.code).toBe('en')
      expect(done.page.blocks.length).toBe(SAMPLE_NOTE_BLOCKS.length)
      expect(done.meta.truncated).toBe(false)
    }
  })

  it('rejects a page id that could break stream framing', async () => {
    const base = await start(createApp(mockConfig()))
    const response = await fetch(`${base}/api/ocr`, {
      method: 'POST',
      body: ocrForm('bad id!', await makeImage()),
    })
    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe('INVALID_IMAGE')
  })

  it('streams translation blocks preserving ids', async () => {
    const base = await start(createApp(mockConfig()))
    const response = await fetch(`${base}/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'en',
        target: 'es',
        blocks: [
          { id: 'p1-b0', text: SAMPLE_NOTE_BLOCKS[0]?.text ?? 'Field notes' },
          { id: 'p1-b1', text: SAMPLE_NOTE_BLOCKS[1]?.text ?? 'Tide report' },
        ],
      }),
    })
    expect(response.status).toBe(200)

    const events = parseLines<TranslateStreamEvent>(await response.text())
    const blocks = events.filter((event) => event.type === 'block')
    expect(blocks).toHaveLength(2)
    expect(blocks.map((event) => (event.type === 'block' ? event.block.id : ''))).toEqual([
      'p1-b0',
      'p1-b1',
    ])
    const done = events.find((event) => event.type === 'done')
    expect(done?.type === 'done' ? done.blocks[0]?.text : '').toContain('Notas de campo')
  })

  it('refuses to invent a translation from an empty request', async () => {
    const base = await start(createApp(mockConfig()))
    const response = await fetch(`${base}/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'en', target: 'es', blocks: [] }),
    })
    expect(response.status).toBe(400)
  })

  it('returns a setup error instead of calling Gemini without a key', async () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      GEMINI_API_KEY: '',
      MOCK_GEMINI: '0',
      LOG_LEVEL: 'silent',
    } as NodeJS.ProcessEnv)
    const base = await start(createApp(config))

    const health = (await (await fetch(`${base}/api/health`)).json()) as { mode: string; ok: boolean }
    expect(health).toMatchObject({ mode: 'unconfigured', ok: false })

    const response = await fetch(`${base}/api/ocr`, {
      method: 'POST',
      body: ocrForm('p1', await makeImage()),
    })
    const events = parseLines<OcrStreamEvent>(await response.text())
    const error = events.find((event) => event.type === 'error')
    expect(error?.type === 'error' ? error.error.code : '').toBe('MISSING_KEY')
  })
})
