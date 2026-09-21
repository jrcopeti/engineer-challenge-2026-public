import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app } from './helpers'

describe('app plumbing', () => {
  it('answers /health without auth', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })

  it('sets security headers and hides the framework', async () => {
    const res = await request(app).get('/health')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-frame-options']).toBeDefined()
    expect(res.headers['x-powered-by']).toBeUndefined()
  })

  it('allows the configured browser origin and no other', async () => {
    const allowed = await request(app).get('/health').set('Origin', 'http://localhost:5173')
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173')
    const other = await request(app).get('/health').set('Origin', 'https://evil.example')
    expect(other.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('never echoes a wildcard origin', async () => {
    // The cors package does not treat '*' inside an array as a wildcard, and we rely on
    // that: CORS_ORIGIN=* must fail closed, not open the API to every site.
    const res = await request(app).get('/health').set('Origin', '*')
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })
})
