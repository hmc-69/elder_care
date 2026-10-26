const assert = require('node:assert/strict')
const { after, before, test } = require('node:test')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'security_test_secret_32_characters_minimum_length_safe'

const prismaMock = {
  user: {
    findUnique: async () => null,
  },
}

const prismaPath = require.resolve('../src/lib/prisma')
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prismaMock }
const app = require('../src/index')

let server
let baseUrl

before(async () => {
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('GET /health and GET /api/health return service status without exposing internals', async () => {
  for (const path of ['/health', '/api/health']) {
    const res = await fetch(`${baseUrl}${path}`)
    assert.equal(res.status, 200)
    const data = await res.json()
    assert.equal(data.status, 'ok')
    assert.equal(data.service, 'ElderCare Connect API')
    assert.equal(data.database, undefined, 'Must not expose internal database details')
  }
})

test('Security headers are enforced and x-powered-by is suppressed', async () => {
  const res = await fetch(`${baseUrl}/health`)
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(res.headers.get('x-frame-options'), 'DENY')
  assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin')
  assert.equal(res.headers.get('x-powered-by'), null, 'x-powered-by must be suppressed')
})

test('Body parser enforces 20kb payload limit', async () => {
  const largeBody = 'a'.repeat(25 * 1024)
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@example.com', password: largeBody }),
  })
  assert.equal(res.status, 413, 'Large body should receive 413 Payload Too Large')
})

test('Auth rate limiter rejects excessive requests when rate limiting is active', async () => {
  let hitRateLimit = false
  for (let i = 0; i < 15; i++) {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-rate-limit': 'true',
      },
      body: JSON.stringify({ email: 'unknown@example.com', password: 'password123' }),
    })
    if (res.status === 429) {
      hitRateLimit = true
      const data = await res.json()
      assert.ok(data.message.includes('Too many'))
      assert.ok(res.headers.get('retry-after'))
      break
    }
  }
  assert.ok(hitRateLimit, 'Should have received HTTP 429 after exceeding attempt threshold')
})

test('Unknown routes return 404 without leaking server information', async () => {
  const res = await fetch(`${baseUrl}/api/nonexistent-route-for-testing`)
  assert.equal(res.status, 404)
  const data = await res.json()
  assert.deepEqual(data, { message: 'Route not found.' })
})
