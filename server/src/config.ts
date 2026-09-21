import 'dotenv/config'

const PLACEHOLDER_SECRETS = new Set(['', 'change-me-in-production', 'pulse-dev-secret-2024'])

function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET ?? ''
  if (PLACEHOLDER_SECRETS.has(secret) || secret.length < 32) {
    throw new Error(
      'JWT_SECRET must be set to a random string of at least 32 characters. ' +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('base64'))\""
    )
  }
  return secret
}

function llmProvider(): 'fake' | 'anthropic' {
  const value = process.env.LLM_PROVIDER ?? 'fake'
  if (value !== 'fake' && value !== 'anthropic') {
    throw new Error(`LLM_PROVIDER must be "fake" or "anthropic", got "${value}"`)
  }
  return value
}

export const config = {
  jwtSecret: requireJwtSecret(),
  jwtExpiresIn: '7d' as const,
  port: Number(process.env.PORT) || 4000,
  // ':memory:' for tests; a file path otherwise.
  dbPath: process.env.DB_PATH,
  llm: {
    provider: llmProvider(),
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    // Summaries are two sentences; the small model is fast and cheap. Override per env.
    anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5',
  },
}
