// Runs before any app module is imported. config.ts validates these at import time.
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-validation-1234'
process.env.DB_PATH = ':memory:'
process.env.FAKE_LLM = 'true'
