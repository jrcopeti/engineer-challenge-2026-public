import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import { app, resetDb, bearer, forgedToken, unsignedToken, ALICE, ALICE_PASSWORD } from './helpers'

beforeAll(() => resetDb())

describe('POST /login', () => {
  it('returns a token and the public user for valid credentials', async () => {
    const res = await request(app)
      .post('/login')
      .send({ email: ALICE.email, password: ALICE_PASSWORD })
    expect(res.status).toBe(200)
    expect(res.body.user).toEqual(ALICE)
    expect(typeof res.body.token).toBe('string')
    expect(res.body.user).not.toHaveProperty('password')
    expect(res.body.user).not.toHaveProperty('password_hash')
  })

  it('accepts the email case-insensitively with surrounding whitespace', async () => {
    const res = await request(app)
      .post('/login')
      .send({ email: '  Alice@Pulse.test ', password: ALICE_PASSWORD })
    expect(res.status).toBe(200)
  })

  it('rejects a wrong password', async () => {
    const res = await request(app).post('/login').send({ email: ALICE.email, password: 'nope' })
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Invalid email or password' })
  })

  it('rejects an unknown email with the same message as a wrong password', async () => {
    const res = await request(app)
      .post('/login')
      .send({ email: 'nobody@pulse.test', password: 'x' })
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Invalid email or password' })
  })

  it('rejects a malformed body', async () => {
    const res = await request(app)
      .post('/login')
      .send({ email: { $ne: null }, password: 1 })
    expect(res.status).toBe(400)
  })
})

describe('authenticate middleware', () => {
  it('rejects a request with no token', async () => {
    const res = await request(app).get('/feedback')
    expect(res.status).toBe(401)
  })

  it('rejects a token signed with the wrong secret', async () => {
    const res = await request(app).get('/feedback').set('Authorization', `Bearer ${forgedToken()}`)
    expect(res.status).toBe(401)
  })

  it('rejects an unsigned (alg=none) token', async () => {
    const res = await request(app)
      .get('/feedback')
      .set('Authorization', `Bearer ${unsignedToken()}`)
    expect(res.status).toBe(401)
  })

  it('rejects a validly signed token with a tampered payload', async () => {
    const [header, , signature] = (await loginToken()).split('.')
    const tampered = Buffer.from(JSON.stringify({ ...ALICE, role: 'manager' })).toString(
      'base64url'
    )
    const res = await request(app)
      .get('/feedback')
      .set('Authorization', `Bearer ${header}.${tampered}.${signature}`)
    expect(res.status).toBe(401)
  })

  it('accepts a token issued by /login', async () => {
    const res = await request(app)
      .get('/feedback')
      .set('Authorization', `Bearer ${await loginToken()}`)
    expect(res.status).toBe(200)
  })
})

describe('GET /users', () => {
  it('never returns password hashes', async () => {
    const res = await request(app).get('/users').set(bearer())
    expect(res.status).toBe(200)
    expect(res.body.users.length).toBeGreaterThan(0)
    for (const user of res.body.users) {
      expect(Object.keys(user).sort()).toEqual(['email', 'id', 'name', 'role'])
    }
  })
})

describe('GET /export.csv', () => {
  it('requires the Authorization header', async () => {
    const res = await request(app).get('/export.csv')
    expect(res.status).toBe(401)
  })

  it('ignores a token passed in the query string', async () => {
    const res = await request(app).get(`/export.csv?token=${await loginToken()}`)
    expect(res.status).toBe(401)
  })

  it('works with the Authorization header', async () => {
    const res = await request(app).get('/export.csv').set(bearer())
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/csv/)
  })
})

async function loginToken(): Promise<string> {
  const res = await request(app)
    .post('/login')
    .send({ email: ALICE.email, password: ALICE_PASSWORD })
  return res.body.token
}
