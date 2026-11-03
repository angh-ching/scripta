# Scripta

Handwriting in. Editable, translatable text out.

Scripta is a local-first handwriting digitizer. Drop a photo of a page and Gemini reads it into
structured blocks — headings, paragraphs, lists, tables, equations — then keeps every block tied
to the ink it came from. Review the two words that matter, translate the page into one of 40+
languages, and export it. No accounts, no analytics, no server-side archive.

```
image  →  Gemini OCR  →  language  →  editable transcript + translation
```

## What makes it different

- **Live bounding boxes.** Every block is tied to a normalized box on the scan. Hover a line to
  find it on the page; select it to keep it highlighted.
- **Confidence review.** Blocks below the confidence threshold are queued into a review bar with
  keyboard navigation. Mark them right, fix them, and the counter clears.
- **Multi-page notes.** Upload up to 20 pages; OCR runs two pages at a time and streams text into
  the page you are reading. Pages keep their own language detection and warnings.
- **Streaming results.** The server writes NDJSON: blocks appear while Gemini is still reading,
  and translations stream block by block with their ids intact.
- **Math and tables.** LaTeX survives as KaTeX, GFM tables become real tables, lists stay lists.
- **Local history.** Finished notes autosave to IndexedDB with compressed page images, transcript,
  review marks and translation. The archive can be inspected, reopened and cleared in one place.
- **Translation that respects shape.** Headings, lists, tables and inline math keep their structure.
  RTL targets are rendered right-to-left without flipping source excerpts.
- **Private by default.** The API key never reaches the browser. Images are sent to Gemini and are
  not written to disk by the server. History never leaves the device.

## Stack

- React 19 + TypeScript + Vite
- Express 5 + Zod + Multer + Sharp + Helmet + rate limiting
- `@google/genai` with streamed structured output
- IndexedDB (`idb`) for the archive; plain CSS Modules for the editorial interface
- Vitest / Testing Library / Playwright

The client and API ship as **one Node service**: the server serves the static Vite build and the
API on the same origin, which keeps the Content Security Policy and NDJSON streaming simple.

## Requirements

- Node.js 22+
- npm 10+
- A Gemini API key from https://aistudio.google.com/apikey (optional for demo mode)

## Local development

```bash
npm install
cp .env.example .env.local   # then add GEMINI_API_KEY
npm run dev
```

`npm run dev` starts both processes:

- Vite on http://localhost:5173
- API on http://127.0.0.1:8787 (Vite proxies `/api` to it)

Without a key, development automatically runs in **demo mode**: OCR and translation are simulated
with canned content so the whole interface can be exercised. The header shows a `DEMO` badge and
the health route reports `"mode": "mock"`.

To force demo mode even with a key:

```bash
MOCK_GEMINI=1 npm run dev
```

## Configuration

Environment variables are read from `.env.local`, then `.env`, then the process environment.
`.env.local` is never committed.

| Variable | Default | Meaning |
| --- | --- | --- |
| `GEMINI_API_KEY` | — | Required for live OCR and translation. Server-side only. |
| `GEMINI_MODEL` | `gemini-flash-latest` | Gemini model id/alias. |
| `PORT` | `8787` | API and production web port. |
| `MOCK_GEMINI` | `0` | `1` forces simulated OCR/translation. |
| `MOCK_DELAY_MS` | `70` | Delay per streamed demo block. |
| `MAX_UPLOAD_MB` | `12` | Per-image upload limit (clamped to 1–25 MB). |
| `RATE_LIMIT_PER_MIN` | `30` | AI requests per minute per IP (clamped to 1–300). |
| `LOG_LEVEL` | `info` | Pino level (`silent` in tests). |

In production (`NODE_ENV=production`) a missing key is **not** silently mocked: the health route
reports `unconfigured` and scan requests return a `MISSING_KEY` error.

## Production build

```bash
npm run build   # typecheck + Vite build + bundled server (dist-server/index.js)
NODE_ENV=production npm start
```

Then open http://localhost:8787. Both the app and `/api` are served by Express. The production
server only serves `dist/` when `NODE_ENV=production`.

## Docker

The image is a multi-stage build: Node 22 installs and builds the app, then a slim runtime carries
only production modules, `dist/` and `dist-server/`.

```bash
# with a key
GEMINI_API_KEY=your-key docker compose up --build

# demo mode, no key
docker compose up --build
# or
docker build -t scripta .
docker run --rm -p 8787:8787 -e GEMINI_API_KEY=your-key scripta
```

Open http://localhost:8787. Compose reads `GEMINI_API_KEY`, `GEMINI_MODEL`, `MAX_UPLOAD_MB`,
`RATE_LIMIT_PER_MIN` and `LOG_LEVEL` from the shell or a local `.env` file.

The container runs as the unprivileged `node` user and includes a healthcheck against
`/api/health`. Page images are held in memory only for the duration of a request; the container
needs no writable volume.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API + Vite with live reload. |
| `npm run typecheck` | Strict TypeScript for client and server. |
| `npm run lint` | ESLint with React Hooks and jsx-a11y. |
| `npm test` | Vitest unit and live-API tests (demo mode, no key needed). |
| `npm run build` | Typecheck, Vite build, tsup server bundle. |
| `npm run check` | Typecheck + lint + tests + build. |
| `npm run e2e` | Playwright suite against a production build. |

The Playwright suite expects Chromium (`npx playwright install chromium`). It builds the app and
starts it in demo mode on port 8787; set `PLAYWRIGHT_BASE_URL` to test a running instance instead.

## API

Both AI routes stream `application/x-ndjson`, one JSON event per line. Errors after the stream has
started arrive as an `error` event, so the UI can keep partial results.

### `GET /api/health`

```json
{ "ok": true, "mode": "live", "model": "gemini-flash-latest", "maxUploadMb": 12, "version": "1.0.0" }
```

`mode` is `live`, `mock` or `unconfigured`.

### `POST /api/ocr`

`multipart/form-data` with `image` (JPG, PNG or WebP), `pageId` (`[A-Za-z0-9_-]{1,80}`) and an
optional `hintLanguage`.

Events: `start`, then `block` for each streamed block, optional `warning`, then `done` with the
normalized page; or `error`.

The image is normalized with Sharp: EXIF rotation applied, resized to a readable size, metadata
stripped, re-encoded as JPEG before it is sent to Gemini.

### `POST /api/translate`

```json
{ "source": "en", "target": "es", "blocks": [{ "id": "p1-b0", "text": "Field notes" }] }
```

Events: `start`, then `block` with `{ id, text }`, then `done` with the full block list and meta.
Source language may be `auto`.

## Architecture

```
shared/        contracts, block helpers, language registry, demo sample
server/        config, upload normalization, Gemini streaming, demo streams, errors, app
src/
  components/  upload, workspace, editor, history, help, ui
  features/    workspace state (reducer + hook), autosave
  lib/         API client, NDJSON reader, image prep, IndexedDB, exports
  styles/      tokens + globals
tests/         Vitest unit, component and live-API tests
e2e/           Playwright flow
```

The server re-scans Gemini's partial JSON with a small dependency-free array reader, so each
completed block can be emitted before the full document exists. The client mirrors that stream into
the reducer, which owns page status, selection, review marks, undo/redo and translation staleness.
Translation is keyed by block id, so an edit invalidates the translation without losing its place.

## Privacy and security

- The Gemini key is read by the server only; the browser bundle never contains it.
- The server does not persist uploads, transcripts or translations.
- History lives in IndexedDB and can be cleared from the History drawer.
- Helmet sets a strict CSP; the API is rate limited; uploads are size-limited and re-encoded
  through Sharp; page ids are validated before they touch the stream.
- `.env.local`, build output, test output and browser data are gitignored.

## Troubleshooting

**The app says demo mode.** No key was found in `.env.local`/`.env`, or `MOCK_GEMINI=1` is set.
Add the key and restart the API process.

**Scans fail with `MISSING_KEY` in production.** Production deliberately refuses to fake OCR.
Set `GEMINI_API_KEY` on the service or run with `MOCK_GEMINI=1` for a demo deployment.

**`/api/health` works but the UI does not load in production.** Start with
`NODE_ENV=production` and make sure `dist/` exists (`npm run build`).

**Port 5173 is busy.** Vite picks the next free port; the proxy still targets 8787.

**A scan is too large.** Raise `MAX_UPLOAD_MB`, or let the client downscale the image first — the
browser already resizes long edges before upload.
