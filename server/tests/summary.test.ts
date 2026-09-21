import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import { app, resetDb, bearer } from './helpers'
import { createApp } from '../src/app'
import { SummarizerError, createSummarizer, type Summarizer } from '../src/llm'

beforeAll(() => resetDb())

describe('POST /feedback/:id/summary', () => {
  it('summarizes the actual message with the fake provider', async () => {
    const res = await request(app).post('/feedback/2/summary').set(bearer())
    expect(res.status).toBe(200)
    // Seed message 2 starts "The export button on the reports page..."
    expect(res.body.summary).toContain('The export button')
  })

  it('maps a provider failure to 502 with the provider message, not 500', async () => {
    const failing: Summarizer = {
      async summarize() {
        throw new SummarizerError('The summary service is busy. Try again in a moment.')
      },
    }
    const res = await request(createApp({ summarizer: failing }))
      .post('/feedback/2/summary')
      .set(bearer())
    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'The summary service is busy. Try again in a moment.' })
  })

  it('still treats an unexpected error as a 500 without leaking its message', async () => {
    const broken: Summarizer = {
      async summarize() {
        throw new TypeError('secret internal detail')
      },
    }
    const res = await request(createApp({ summarizer: broken }))
      .post('/feedback/2/summary')
      .set(bearer())
    expect(res.status).toBe(500)
    expect(res.text).not.toContain('secret internal detail')
  })
})

describe('createSummarizer', () => {
  it('refuses the anthropic provider without an API key', () => {
    expect(() => createSummarizer({ provider: 'anthropic', anthropicModel: 'x' })).toThrow(
      /ANTHROPIC_API_KEY/
    )
  })

  it('builds the anthropic provider when a key is present (no network call)', () => {
    const s = createSummarizer({
      provider: 'anthropic',
      anthropicApiKey: 'sk-ant-test',
      anthropicModel: 'x',
    })
    expect(typeof s.summarize).toBe('function')
  })
})
