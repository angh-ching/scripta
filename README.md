# Scripta

Handwriting in. Editable, translatable text out.

Scripta is a local-first handwriting digitizer. Drop a photo of a page and a vision model reads
it into structured blocks — headings, paragraphs, lists, tables, equations — then keeps every
block tied to the ink it came from. Review the two words that matter, translate the page into one
of 40+ languages, and export it. No accounts, no analytics, no server-side archive.

```
image  →  vision OCR  →  language  →  editable transcript + translation
```

OpenRouter is the default provider; Gemini is also supported. Both are server-side only.

## What makes it different

- **Live bounding boxes.** Every block is tied to a normalized box on the scan. Hover a line to
  find it on the page; select it to keep it highlighted.
- **Confidence review.** Blocks below the confidence threshold are queued into a review bar with
  keyboard navigation. Mark them right, fix them, and the counter clears.
- **Multi-page notes.** Upload up to 20 pages; OCR runs two pages at a time and streams text into
  the page you are reading. Pages keep their own language detection and warnings.
- **Streaming results.** The server writes NDJSON: blocks appear while the model is still reading,
  and translations stream block by block with their ids intact.
- **Math and tables.** LaTeX survives as KaTeX, GFM tables become real tables, lists stay lists.
- **Local history.** Finished notes autosave to IndexedDB with compressed page images, transcript,
  review marks and translation. The archive can be inspected, reopened and cleared in one place.
- **Translation that respects shape.** Headings, lists, tables and inline math keep their structure.
  RTL targets are rendered right-to-left without flipping source excerpts.
- **Private by default.** The API key never reaches the browser. Images are sent to the selected
  provider for inference and are not written to disk by the server. History never leaves the device.

## Stack

- React 19 + TypeScript + Vite
- Express 5 + Zod + Multer + Sharp + Helmet + rate limiting
- OpenRouter chat completions (OpenAI-compatible) or `@google/genai`, both with streamed
  structured output
- IndexedDB (`idb`) for the archive; plain CSS Modules for the editorial interface
- Vitest / Testing Library / Playwright

The client and API ship as **one Node service**: the server serves the static Vite build and the
API on the same origin, which keeps the Content Security Policy and NDJSON streaming simple.

## Requirements

- Node.js 22+
- npm 10+
- An OpenRouter key from https://openrouter.ai/keys (recommended) or a Gemini key from
  https://aistudio.google.com/apikey. A key is optional for demo mode.

## Local development

```bash
npm install
cp .env.example .env.local   # then paste OPENROUTER_API_KEY or GEMINI_API_KEY
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

## Providers

Scripta can use either provider without changing the client or stream format:

- **OpenRouter (recommended).** Uses the OpenAI-compatible chat-completions API at
  `https://openrouter.ai/api/v1`. Set `OPENROUTER_API_KEY`.
- **Gemini.** Uses the native `@google/genai` SDK. Set `GEMINI_API_KEY`.

Selection is automatic: if `AI_PROVIDER` is unset, OpenRouter wins when its key exists, otherwise
Gemini is used. Set `AI_PROVIDER=openrouter` or `AI_PROVIDER=gemini` to choose explicitly.

The default OpenRouter model is **`nvidia/nemotron-3.5-super-vl:free`**: a vision model with
JSON-schema structured output, verified on handwritten notes for OCR, bounding boxes and
translation. It costs nothing, but free variants are capped at **50 requests per day** (20 per
minute) until the account has purchased $10 in credits. Each page scan and each translation is one
request.

For daily or production use, set `OPENROUTER_MODEL` to a paid model. Scripta is also tested with
**`google/gemini-2.5-flash`** (roughly $0.001–0.002 per page, no free-tier request cap). Use any
model that supports image input and `structured_outputs`.

Both adapters share the same retry policy, partial-JSON block streaming, error mapping and
translation cache. A translation is cached per provider and model, so switching providers cannot
serve stale output from the other one.

## Configuration

Environment variables are read from `.env.local`, then `.env`, then the process environment.
`.env.local` is never committed.

| Variable              | Default                             | Meaning                                                                 |
| --------------------- | ----------------------------------- | ----------------------------------------------------------------------- |
| `AI_PROVIDER`         | auto                                | `openrouter` or `gemini`. Auto prefers OpenRouter when its key exists.  |
| `OPENROUTER_API_KEY`  | —                                   | OpenRouter key. Required when OpenRouter is selected. Server-side only. |
| `OPENROUTER_MODEL`    | `nvidia/nemotron-3.5-super-vl:free` | Vision + structured-output model.                                       |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1`      | Override for proxies or local gateways.                                 |
| `GEMINI_API_KEY`      | —                                   | Gemini key. Required when Gemini is selected. Server-side only.         |
| `GEMINI_MODEL`        | `gemini-2.5-flash`                  | Gemini model id.                                                        |
| `PORT`                | `8787`                              | API and production web port.                                            |
| `MOCK_GEMINI`         | `0`                                 | `1` forces simulated OCR/translation.                                   |
| `MOCK_DELAY_MS`       | `70`                                | Delay per streamed demo block.                                          |
| `MAX_UPLOAD_MB`       | `12`                                | Per-image upload limit (clamped to 1–25 MB).                            |
| `RATE_LIMIT_PER_MIN`  | `30`                                | AI requests per minute per IP (clamped to 1–300).                       |
| `LOG_LEVEL`           | `info`                              | Pino level (`silent` in tests).                                         |

In production (`NODE_ENV=production`) a missing key is **not** silently mocked: the health route
reports `unconfigured` and scan requests return a `MISSING_KEY` error. The same is true in
development when `AI_PROVIDER` is set explicitly but its key is missing.

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
# OpenRouter (recommended)
OPENROUTER_API_KEY=your-key docker compose up --build

# Gemini instead
AI_PROVIDER=gemini GEMINI_API_KEY=your-key docker compose up --build

# demo mode, no key
docker compose up --build
# or
docker build -t scripta .
docker run --rm -p 8787:8787 -e OPENROUTER_API_KEY=your-key scripta
```

Open http://localhost:8787. Compose reads `AI_PROVIDER`, `OPENROUTER_API_KEY`,
`OPENROUTER_MODEL`, `OPENROUTER_BASE_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`,
`MAX_UPLOAD_MB`, `RATE_LIMIT_PER_MIN` and `LOG_LEVEL` from the shell or a local `.env` file.

The container runs as the unprivileged `node` user and includes a healthcheck against
`/api/health`. Page images are held in memory only for the duration of a request; the container
needs no writable volume.

## Scripts

| Command             | What it does                                               |
| ------------------- | ---------------------------------------------------------- |
| `npm run dev`       | API + Vite with live reload.                               |
| `npm run typecheck` | Strict TypeScript for client and server.                   |
| `npm run lint`      | ESLint with React Hooks and jsx-a11y.                      |
| `npm test`          | Vitest unit and live-API tests (demo mode, no key needed). |
| `npm run build`     | Typecheck, Vite build, tsup server bundle.                 |
| `npm run check`     | Typecheck + lint + tests + build.                          |
| `npm run e2e`       | Playwright suite against a production build.               |

The Playwright suite expects Chromium (`npx playwright install chromium`). It builds the app and
starts it in demo mode on port 8787; set `PLAYWRIGHT_BASE_URL` to test a running instance instead.

## API

Both AI routes stream `application/x-ndjson`, one JSON event per line. Errors after the stream has
started arrive as an `error` event, so the UI can keep partial results.

### `GET /api/health`

```json
{
  "ok": true,
  "mode": "live",
  "provider": "openrouter",
  "model": "nvidia/nemotron-3.5-super-vl:free",
  "maxUploadMb": 12,
  "version": "1.0.0"
}
```

`mode` is `live`, `mock` or `unconfigured`; `provider` is `openrouter` or `gemini`.

### `POST /api/ocr`

`multipart/form-data` with `image` (JPG, PNG or WebP), `pageId` (`[A-Za-z0-9_-]{1,80}`) and an
optional `hintLanguage`.

Events: `start`, then `block` for each streamed block, optional `warning`, then `done` with the
normalized page; or `error`.

The image is normalized with Sharp: EXIF rotation applied, resized to a readable size, metadata
stripped, re-encoded as JPEG before it is sent to the selected provider. OpenRouter receives it as
a base64 data URL alongside a JSON-schema response contract.

### `POST /api/translate`

```json
{ "source": "en", "target": "es", "blocks": [{ "id": "p1-b0", "text": "Field notes" }] }
```

Events: `start`, then `block` with `{ id, text }`, then `done` with the full block list and meta.
Source language may be `auto`.

## Architecture

```
shared/        contracts, block helpers, language registry, demo sample
server/        config, upload normalization, provider adapters, demo streams, errors, app
src/
  components/  upload, workspace, editor, history, help, ui
  features/    workspace state (reducer + hook), autosave
  lib/         API client, NDJSON reader, image prep, IndexedDB, exports
  styles/      tokens + globals
tests/         Vitest unit, component and live-API tests
e2e/           Playwright flow
```

Both provider adapters feed the same orchestrator. It re-scans the model's partial JSON with a
small dependency-free array reader, so each completed block can be emitted before the full
document exists. The client mirrors that stream into the reducer, which owns page status,
selection, review marks, undo/redo and translation staleness. Translation is keyed by block id, so
an edit invalidates the translation without losing its place.

## Privacy and security

- Provider keys are read by the server only; the browser bundle never contains them.
- The server does not persist uploads, transcripts or translations.
- History lives in IndexedDB and can be cleared from the History drawer.
- Helmet sets a strict CSP; the API is rate limited; uploads are size-limited and re-encoded
  through Sharp; page ids are validated before they touch the stream.
- `.env.local`, build output, test output and browser data are gitignored.

## Troubleshooting

**The app says demo mode.** No key was found in `.env.local`/`.env`, `MOCK_GEMINI=1` is set, or
`AI_PROVIDER` points at a provider without a key. Add the matching key and restart the API process.

**Scans fail with `MISSING_KEY` in production.** Production deliberately refuses to fake OCR.
Set `OPENROUTER_API_KEY` (or `GEMINI_API_KEY` with `AI_PROVIDER=gemini`) on the service, or run
with `MOCK_GEMINI=1` for a demo deployment.

**OpenRouter says the model or structured output is unavailable.** Use a vision model that supports
`structured_outputs`; the default free model and `google/gemini-2.5-flash` are tested with this app.
The request sets `provider.require_parameters: true`, so OpenRouter only routes to endpoints with
image and JSON-schema support.

**OpenRouter returns `UPSTREAM_QUOTA` / 402.** The account has no purchased credits, so paid models
are blocked. Keep the default `:free` model or add credits at
https://openrouter.ai/settings/credits. Free-variant scans stop after 50 requests per UTC day until
$10 in credits has been purchased.

**`/api/health` works but the UI does not load in production.** Start with
`NODE_ENV=production` and make sure `dist/` exists (`npm run build`).

**Port 5173 is busy.** Vite picks the next free port; the proxy still targets 8787.

**A scan is too large.** Raise `MAX_UPLOAD_MB`, or let the client downscale the image first — the
browser already resizes long edges before upload.
