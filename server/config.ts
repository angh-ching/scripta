import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

export interface ServerConfig {
  nodeEnv: string
  port: number
  apiKey: string
  model: string
  mock: boolean
  maxUploadMb: number
  rateLimitPerMin: number
  logLevel: string
  mockDelayMs: number
  version: string
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function parseBoolean(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true'
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const nodeEnv = env.NODE_ENV ?? 'development'
  const apiKey = env.GEMINI_API_KEY?.trim() ?? ''
  const explicitMock = parseBoolean(env.MOCK_GEMINI)
  const mock = explicitMock || (!apiKey && nodeEnv !== 'production')

  return {
    nodeEnv,
    port: clamp(parseNumber(env.PORT, 8787), 1, 65_535),
    apiKey,
    model: env.GEMINI_MODEL?.trim() || 'gemini-flash-latest',
    mock,
    maxUploadMb: clamp(parseNumber(env.MAX_UPLOAD_MB, 12), 1, 25),
    rateLimitPerMin: clamp(parseNumber(env.RATE_LIMIT_PER_MIN, 30), 1, 300),
    logLevel: env.LOG_LEVEL ?? 'info',
    mockDelayMs: Math.max(0, parseNumber(env.MOCK_DELAY_MS, 70)),
    version: '1.0.0',
  }
}

export type HealthMode = 'live' | 'mock' | 'unconfigured'

export function healthMode(config: ServerConfig): HealthMode {
  if (config.mock) return 'mock'
  if (!config.apiKey) return 'unconfigured'
  return 'live'
}

export function ocrModelLabel(config: ServerConfig): string {
  return config.mock ? 'demo-reader' : config.model
}
